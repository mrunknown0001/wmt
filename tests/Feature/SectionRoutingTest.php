<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\ProjectAutomationRule;
use App\Models\Task;
use App\Models\TaskSection;
use App\Models\User;
use App\Services\AutomationRuleEngine;
use App\Services\SectionRouter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Sub-sections, and the automation that files submissions into them by period.
 *
 * The case driving this: a public form feeds a project and the submissions have
 * to land in "Requests › 2026-08" rather than one endless column. The month
 * sub-section will not exist until the first submission of that month arrives,
 * so most of what matters here is what happens the first time — and what
 * happens when two arrive at once.
 */
class SectionRoutingTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Project $project;
    private TaskSection $requests;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::create(2026, 8, 5, 9));

        foreach (['manage-tasks', 'manage-projects', 'view-projects'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(['manage-tasks', 'manage-projects', 'view-projects']);

        $this->owner = User::factory()->create(['is_active' => true]);
        $this->owner->assignRole('admin');

        $this->project = Project::create([
            'name' => 'Intake', 'status' => 'active', 'owner_id' => $this->owner->id,
        ]);

        $this->requests = TaskSection::create([
            'project_id' => $this->project->id, 'name' => 'Requests', 'position' => 0,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function task(array $extra = []): Task
    {
        return Task::create($extra + [
            'project_id' => $this->project->id,
            'title' => 'Submitted request',
            'status' => 'to_do',
            'priority' => 'medium',
        ]);
    }

    /** Run a move_to_section action the way the engine would. */
    private function route(Task $task, array $params): Task
    {
        $rule = ProjectAutomationRule::create([
            'project_id' => $this->project->id,
            'name' => 'File by period',
            'is_active' => true,
            'trigger_type' => 'form_submitted',
            'trigger_config' => [],
            'conditions' => [],
            'actions' => [['type' => 'move_to_section', 'params' => $params]],
            'created_by' => $this->owner->id,
        ]);

        AutomationRuleEngine::evaluate($task, 'form_submitted', [], [], []);

        $rule->delete();

        return $task->fresh();
    }

    // ---- the structure ----

    public function test_a_section_can_hold_sub_sections(): void
    {
        $child = TaskSection::create([
            'project_id' => $this->project->id,
            'parent_id' => $this->requests->id,
            'name' => '2026-08',
        ]);

        $this->assertTrue($child->isSubsection());
        $this->assertFalse($this->requests->isSubsection());
        $this->assertSame(['2026-08'], $this->requests->children->pluck('name')->all());
        $this->assertSame('Requests › 2026-08', $child->fullName());
    }

    public function test_nesting_stops_at_one_level(): void
    {
        $child = TaskSection::create([
            'project_id' => $this->project->id,
            'parent_id' => $this->requests->id,
            'name' => '2026-08',
        ]);

        $this->expectException(ValidationException::class);

        TaskSection::create([
            'project_id' => $this->project->id,
            'parent_id' => $child->id,
            'name' => 'Week 1',
        ]);
    }

    public function test_a_section_with_children_cannot_become_a_child(): void
    {
        TaskSection::create([
            'project_id' => $this->project->id,
            'parent_id' => $this->requests->id,
            'name' => '2026-08',
        ]);

        $other = TaskSection::create([
            'project_id' => $this->project->id, 'name' => 'Done', 'position' => 1,
        ]);

        $this->expectException(ValidationException::class);

        $this->requests->update(['parent_id' => $other->id]);
    }

    public function test_a_section_cannot_be_its_own_parent(): void
    {
        $this->expectException(ValidationException::class);

        $this->requests->update(['parent_id' => $this->requests->id]);
    }

    public function test_a_sub_section_cannot_cross_projects(): void
    {
        $other = Project::create([
            'name' => 'Elsewhere', 'status' => 'active', 'owner_id' => $this->owner->id,
        ]);

        $this->expectException(ValidationException::class);

        TaskSection::create([
            'project_id' => $other->id,
            'parent_id' => $this->requests->id,
            'name' => 'Stray',
        ]);
    }

    public function test_roots_returns_only_the_columns(): void
    {
        TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $this->requests->id, 'name' => '2026-08',
        ]);
        TaskSection::create(['project_id' => $this->project->id, 'name' => 'Done', 'position' => 1]);

        $this->assertSame(
            ['Requests', 'Done'],
            TaskSection::roots()->orderBy('position')->pluck('name')->all()
        );
    }

    // ---- routing by period ----

    public function test_a_submission_creates_the_month_it_arrives_in(): void
    {
        $task = $this->route($this->task(), [
            'section_id' => $this->requests->id,
            'subsection_mode' => 'period',
            'period_format' => 'year_month',
        ]);

        $child = $this->requests->children()->first();

        $this->assertSame('2026-08', $child->name);
        $this->assertSame($child->id, $task->section_id);
    }

    public function test_the_next_submission_that_month_reuses_it(): void
    {
        $params = [
            'section_id' => $this->requests->id,
            'subsection_mode' => 'period',
            'period_format' => 'year_month',
        ];

        $first = $this->route($this->task(), $params);
        $second = $this->route($this->task(), $params);

        $this->assertSame($first->section_id, $second->section_id);
        $this->assertSame(1, $this->requests->children()->count());
    }

    public function test_a_new_month_gets_its_own_sub_section(): void
    {
        $params = [
            'section_id' => $this->requests->id,
            'subsection_mode' => 'period',
            'period_format' => 'year_month',
        ];

        $august = $this->route($this->task(), $params);

        Carbon::setTestNow(Carbon::create(2026, 9, 2, 9));
        $september = $this->route($this->task(), $params);

        $this->assertNotSame($august->section_id, $september->section_id);
        $this->assertSame(
            ['2026-08', '2026-09'],
            $this->requests->children()->pluck('name')->all()
        );
    }

    public function test_every_period_format_names_the_sub_section_its_own_way(): void
    {
        $date = Carbon::create(2026, 8, 5);

        $this->assertSame('2026-08', SectionRouter::periodName($date, 'year_month'));
        $this->assertSame('August 2026', SectionRouter::periodName($date, 'month_name'));
        $this->assertSame('2026', SectionRouter::periodName($date, 'year'));
        $this->assertSame('2026-Q3', SectionRouter::periodName($date, 'quarter'));
    }

    public function test_an_unknown_format_falls_back_to_year_and_month(): void
    {
        $this->assertSame('2026-08', SectionRouter::periodName(Carbon::create(2026, 8, 5), 'nonsense'));
    }

    public function test_the_period_can_be_taken_from_the_due_date_instead(): void
    {
        $task = $this->route($this->task(['due_date' => '2026-11-20']), [
            'section_id' => $this->requests->id,
            'subsection_mode' => 'period',
            'period_format' => 'year_month',
            'period_source' => 'due',
        ]);

        // Filed under the month it is due, not the month it arrived.
        $this->assertSame('2026-11', TaskSection::find($task->section_id)->name);
    }

    public function test_filing_by_due_date_falls_back_to_the_section_when_there_is_none(): void
    {
        $task = $this->route($this->task(), [
            'section_id' => $this->requests->id,
            'subsection_mode' => 'period',
            'period_source' => 'due',
        ]);

        // Today's month would be a month this task has nothing to do with.
        $this->assertSame($this->requests->id, $task->section_id);
        $this->assertSame(0, $this->requests->children()->count());
    }

    public function test_two_submissions_at_once_share_one_sub_section(): void
    {
        $params = [
            'section_id' => $this->requests->id,
            'subsection_mode' => 'period',
            'period_format' => 'year_month',
        ];

        // Resolved back to back without re-reading — the shape of a race, and
        // what the lock in SectionRouter is there to prevent.
        $a = SectionRouter::resolve($this->task(), $params);
        $b = SectionRouter::resolve($this->task(), $params);

        $this->assertSame($a, $b);
        $this->assertSame(1, $this->requests->children()->count());
    }

    // ---- the other modes ----

    public function test_no_mode_files_straight_into_the_section(): void
    {
        $task = $this->route($this->task(), ['section_id' => $this->requests->id]);

        $this->assertSame($this->requests->id, $task->section_id);
        $this->assertSame(0, $this->requests->children()->count());
    }

    public function test_a_fixed_sub_section_is_used_as_chosen(): void
    {
        $urgent = TaskSection::create([
            'project_id' => $this->project->id,
            'parent_id' => $this->requests->id,
            'name' => 'Urgent',
        ]);

        $task = $this->route($this->task(), [
            'section_id' => $this->requests->id,
            'subsection_mode' => 'fixed',
            'subsection_id' => $urgent->id,
        ]);

        $this->assertSame($urgent->id, $task->section_id);
    }

    public function test_a_fixed_sub_section_that_has_gone_falls_back_to_the_section(): void
    {
        $urgent = TaskSection::create([
            'project_id' => $this->project->id,
            'parent_id' => $this->requests->id,
            'name' => 'Urgent',
        ]);
        $id = $urgent->id;
        $urgent->delete();

        $task = $this->route($this->task(), [
            'section_id' => $this->requests->id,
            'subsection_mode' => 'fixed',
            'subsection_id' => $id,
        ]);

        $this->assertSame($this->requests->id, $task->section_id);
    }

    public function test_a_sub_section_of_another_section_is_not_accepted(): void
    {
        $other = TaskSection::create([
            'project_id' => $this->project->id, 'name' => 'Done', 'position' => 1,
        ]);
        $itsChild = TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $other->id, 'name' => 'Archive',
        ]);

        $task = $this->route($this->task(), [
            'section_id' => $this->requests->id,
            'subsection_mode' => 'fixed',
            'subsection_id' => $itsChild->id,
        ]);

        $this->assertSame($this->requests->id, $task->section_id);
    }

    public function test_a_deleted_section_leaves_the_task_where_it_is(): void
    {
        $id = $this->requests->id;
        $this->requests->delete();

        $task = $this->task(['section_id' => null]);
        $result = $this->route($task, ['section_id' => $id, 'subsection_mode' => 'period']);

        $this->assertNull($result->section_id);
    }

    // ---- the HTTP surface ----

    public function test_a_sub_section_can_be_created_through_the_api(): void
    {
        $this->actingAs($this->owner)
            ->postJson("/projects/{$this->project->id}/sections", [
                'name' => 'Q3',
                'parent_id' => $this->requests->id,
            ])
            ->assertCreated()
            ->assertJsonPath('parent_id', $this->requests->id);
    }

    public function test_the_api_refuses_a_third_level(): void
    {
        $child = TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $this->requests->id, 'name' => 'Q3',
        ]);

        $this->actingAs($this->owner)
            ->postJson("/projects/{$this->project->id}/sections", [
                'name' => 'Week 1',
                'parent_id' => $child->id,
            ])
            ->assertStatus(422);
    }

    public function test_the_api_refuses_a_parent_from_another_project(): void
    {
        $other = Project::create([
            'name' => 'Elsewhere', 'status' => 'active', 'owner_id' => $this->owner->id,
        ]);
        $foreign = TaskSection::create(['project_id' => $other->id, 'name' => 'Theirs']);

        $this->actingAs($this->owner)
            ->postJson("/projects/{$this->project->id}/sections", [
                'name' => 'Stray',
                'parent_id' => $foreign->id,
            ])
            ->assertStatus(422);
    }

    public function test_sub_sections_are_numbered_among_their_siblings(): void
    {
        // Not against the top-level columns — two lists, two sequences.
        TaskSection::create(['project_id' => $this->project->id, 'name' => 'Done', 'position' => 1]);

        $first = $this->actingAs($this->owner)->postJson("/projects/{$this->project->id}/sections", [
            'name' => 'A', 'parent_id' => $this->requests->id,
        ])->json();

        $second = $this->actingAs($this->owner)->postJson("/projects/{$this->project->id}/sections", [
            'name' => 'B', 'parent_id' => $this->requests->id,
        ])->json();

        $this->assertSame(0, $first['position']);
        $this->assertSame(1, $second['position']);
    }

    public function test_deleting_a_section_frees_the_tasks_in_its_sub_sections(): void
    {
        $child = TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $this->requests->id, 'name' => '2026-08',
        ]);
        $task = $this->task(['section_id' => $child->id]);

        $this->actingAs($this->owner)
            ->deleteJson("/projects/{$this->project->id}/sections/{$this->requests->id}")
            ->assertOk();

        $this->assertNull($task->fresh()->section_id);
        $this->assertSame(0, TaskSection::count());
    }

    // ---- reordering and dragging ----

    public function test_reordering_moves_a_sub_section_to_another_column(): void
    {
        $archive = TaskSection::create([
            'project_id' => $this->project->id, 'name' => 'Archive', 'position' => 1,
        ]);
        $month = TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $this->requests->id,
            'name' => '2026-08', 'position' => 0,
        ]);

        $this->actingAs($this->owner)
            ->postJson("/projects/{$this->project->id}/sections/reorder", [
                'sections' => [
                    ['id' => $month->id, 'position' => 0, 'parent_id' => $archive->id],
                ],
            ])
            ->assertOk();

        $this->assertSame($archive->id, $month->fresh()->parent_id);
    }

    public function test_reordering_can_promote_a_sub_section_to_a_column(): void
    {
        $month = TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $this->requests->id, 'name' => '2026-08',
        ]);

        $this->actingAs($this->owner)
            ->postJson("/projects/{$this->project->id}/sections/reorder", [
                'sections' => [['id' => $month->id, 'position' => 1, 'parent_id' => null]],
            ])
            ->assertOk();

        $this->assertNull($month->fresh()->parent_id);
    }

    public function test_reordering_refuses_a_move_that_would_nest_too_deep(): void
    {
        $month = TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $this->requests->id, 'name' => '2026-08',
        ]);
        $other = TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $this->requests->id, 'name' => '2026-09',
        ]);

        $this->actingAs($this->owner)
            ->postJson("/projects/{$this->project->id}/sections/reorder", [
                'sections' => [['id' => $other->id, 'position' => 0, 'parent_id' => $month->id]],
            ])
            ->assertStatus(422);

        // The batch is a transaction, so nothing is left half-applied.
        $this->assertSame($this->requests->id, $other->fresh()->parent_id);
    }

    public function test_reordering_without_a_parent_leaves_the_hierarchy_alone(): void
    {
        // The shape an ordinary column reorder sends, unchanged from before
        // sub-sections existed.
        $month = TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $this->requests->id,
            'name' => '2026-08', 'position' => 0,
        ]);

        $this->actingAs($this->owner)
            ->postJson("/projects/{$this->project->id}/sections/reorder", [
                'sections' => [['id' => $month->id, 'position' => 3]],
            ])
            ->assertOk();

        $fresh = $month->fresh();
        $this->assertSame(3, $fresh->position);
        $this->assertSame($this->requests->id, $fresh->parent_id);
    }

    public function test_a_task_can_be_dragged_into_a_sub_section(): void
    {
        $month = TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $this->requests->id, 'name' => '2026-08',
        ]);
        $task = $this->task(['section_id' => $this->requests->id]);

        $this->actingAs($this->owner)
            // The endpoint validates the whole task, so the unchanged
            // required fields travel with the one that moved.
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}", [
                'title' => $task->title,
                'status' => $task->status,
                'priority' => $task->priority,
                'section_id' => $month->id,
            ])
            // A web route, so a successful update redirects rather than
            // returning 200.
            ->assertRedirect();

        $this->assertSame($month->id, $task->fresh()->section_id);
    }

    public function test_tasks_keep_their_own_order_inside_a_sub_section(): void
    {
        $month = TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $this->requests->id, 'name' => '2026-08',
        ]);

        $a = $this->task(['section_id' => $month->id, 'position' => 0]);
        $b = $this->task(['section_id' => $month->id, 'position' => 1]);

        $this->actingAs($this->owner)
            ->postJson("/projects/{$this->project->id}/tasks/reorder", [
                'tasks' => [
                    ['id' => $b->id, 'position' => 0, 'status' => $b->status, 'section_id' => $month->id],
                    ['id' => $a->id, 'position' => 1, 'status' => $a->status, 'section_id' => $month->id],
                ],
            ])
            ->assertSuccessful();

        $this->assertSame(0, $b->fresh()->position);
        $this->assertSame(1, $a->fresh()->position);
    }

    public function test_duplicating_a_project_keeps_the_hierarchy(): void
    {
        $child = TaskSection::create([
            'project_id' => $this->project->id,
            'parent_id' => $this->requests->id,
            'name' => '2026-08',
        ]);

        // The endpoint names the copy itself, so it is found by exclusion.
        $this->actingAs($this->owner)
            ->postJson("/projects/{$this->project->id}/duplicate", ['include_tasks' => false])
            ->assertSuccessful();

        $copy = Project::whereKeyNot($this->project->id)->firstOrFail();
        $copiedParent = $copy->sections()->whereNull('parent_id')->firstOrFail();
        $copiedChild = $copy->sections()->whereNotNull('parent_id')->firstOrFail();

        $this->assertSame('Requests', $copiedParent->name);
        $this->assertSame('2026-08', $copiedChild->name);
        // Pointed at the copy's own column, not the original's.
        $this->assertSame($copiedParent->id, $copiedChild->parent_id);
        $this->assertNotSame($child->parent_id, $copiedChild->parent_id);
    }

    public function test_a_rule_can_be_saved_with_period_routing(): void
    {
        $this->actingAs($this->owner)
            ->postJson("/projects/{$this->project->id}/automation-rules", [
                'name' => 'File submissions by month',
                'trigger_type' => 'form_submitted',
                'actions' => [[
                    'type' => 'move_to_section',
                    'params' => [
                        'section_id' => $this->requests->id,
                        'subsection_mode' => 'period',
                        'period_format' => 'year_month',
                        'period_source' => 'created',
                    ],
                ]],
            ])
            ->assertSuccessful();
    }

    public function test_a_rule_pointing_at_a_sub_section_keeps_the_sub_section(): void
    {
        $month = TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $this->requests->id, 'name' => '2026-08',
        ]);

        $this->actingAs($this->owner)
            ->postJson("/projects/{$this->project->id}/automation-rules", [
                'name' => 'File into August',
                'trigger_type' => 'form_submitted',
                'actions' => [[
                    'type' => 'move_to_section',
                    'params' => [
                        'section_id' => $this->requests->id,
                        'subsection_mode' => 'fixed',
                        'subsection_id' => $month->id,
                    ],
                ]],
            ])
            ->assertSuccessful();

        $rule = ProjectAutomationRule::latest('id')->firstOrFail();
        $params = $rule->actions[0]['params'];

        // The whole action has to survive the round trip, not just the parts
        // that happen to have their own validation rule.
        $this->assertSame($this->requests->id, (int) $params['section_id']);
        $this->assertSame('fixed', $params['subsection_mode']);
        $this->assertSame($month->id, (int) $params['subsection_id']);
    }

    public function test_the_browser_shape_of_a_sub_section_rule_saves(): void
    {
        // Ids arrive from a <select> as strings, and cleared fields arrive as
        // empty strings — exactly what the builder sends.
        $month = TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $this->requests->id, 'name' => '2026-08',
        ]);

        $this->actingAs($this->owner)
            ->postJson("/projects/{$this->project->id}/automation-rules", [
                'name' => 'From the browser',
                'trigger_type' => 'form_submitted',
                'actions' => [[
                    'type' => 'move_to_section',
                    'params' => [
                        'section_id' => (string) $this->requests->id,
                        'subsection_mode' => 'fixed',
                        'subsection_id' => (string) $month->id,
                        'period_format' => '',
                        'period_source' => '',
                    ],
                ]],
            ])
            ->assertSuccessful();

        $params = ProjectAutomationRule::latest('id')->firstOrFail()->actions[0]['params'];

        $this->assertSame($month->id, (int) $params['subsection_id']);
    }

    /**
     * Every action type keeps its own params.
     *
     * The nested validation rules that broke section_id applied to every
     * action's params, so a comment lost its message and an assignment lost its
     * user in exactly the same way. This is the guard against reintroducing it.
     */
    public function test_no_action_loses_its_params(): void
    {
        $this->actingAs($this->owner)
            ->postJson("/projects/{$this->project->id}/automation-rules", [
                'name' => 'Everything at once',
                'trigger_type' => 'form_submitted',
                'actions' => [
                    ['type' => 'move_to_section', 'params' => ['section_id' => $this->requests->id]],
                    ['type' => 'assign_user', 'params' => ['user_id' => $this->owner->id]],
                    ['type' => 'add_comment', 'params' => ['message' => 'Received, thank you.']],
                    ['type' => 'change_status', 'params' => ['status' => 'in_progress']],
                    ['type' => 'change_priority', 'params' => ['priority' => 'high']],
                ],
            ])
            ->assertSuccessful();

        $actions = ProjectAutomationRule::latest('id')->firstOrFail()->actions;

        $this->assertSame($this->requests->id, (int) $actions[0]['params']['section_id']);
        $this->assertSame($this->owner->id, (int) $actions[1]['params']['user_id']);
        $this->assertSame('Received, thank you.', $actions[2]['params']['message']);
        $this->assertSame('in_progress', $actions[3]['params']['status']);
        $this->assertSame('high', $actions[4]['params']['priority']);
    }

    public function test_editing_a_rule_keeps_its_params_too(): void
    {
        $month = TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $this->requests->id, 'name' => '2026-08',
        ]);

        $this->actingAs($this->owner)->postJson("/projects/{$this->project->id}/automation-rules", [
            'name' => 'First', 'trigger_type' => 'form_submitted',
            'actions' => [['type' => 'move_to_section', 'params' => ['section_id' => $this->requests->id]]],
        ])->assertSuccessful();

        $rule = ProjectAutomationRule::latest('id')->firstOrFail();

        $this->actingAs($this->owner)
            ->putJson("/projects/{$this->project->id}/automation-rules/{$rule->id}", [
                'name' => 'First',
                'trigger_type' => 'form_submitted',
                'actions' => [[
                    'type' => 'move_to_section',
                    'params' => [
                        'section_id' => $this->requests->id,
                        'subsection_mode' => 'fixed',
                        'subsection_id' => $month->id,
                    ],
                ]],
            ])
            ->assertSuccessful();

        $params = $rule->fresh()->actions[0]['params'];

        $this->assertSame($this->requests->id, (int) $params['section_id']);
        $this->assertSame($month->id, (int) $params['subsection_id']);
    }

    /** A rule saved through the API actually routes when it fires. */
    public function test_a_saved_sub_section_rule_files_the_task_there(): void
    {
        $month = TaskSection::create([
            'project_id' => $this->project->id, 'parent_id' => $this->requests->id, 'name' => '2026-08',
        ]);

        $this->actingAs($this->owner)->postJson("/projects/{$this->project->id}/automation-rules", [
            'name' => 'File into August',
            'trigger_type' => 'form_submitted',
            'actions' => [[
                'type' => 'move_to_section',
                'params' => [
                    'section_id' => (string) $this->requests->id,
                    'subsection_mode' => 'fixed',
                    'subsection_id' => (string) $month->id,
                ],
            ]],
        ])->assertSuccessful();

        $task = $this->task();
        AutomationRuleEngine::evaluate($task, 'form_submitted', [], [], []);

        $this->assertSame($month->id, $task->fresh()->section_id);
    }

    public function test_an_unknown_period_format_is_rejected(): void
    {
        $this->actingAs($this->owner)
            ->postJson("/projects/{$this->project->id}/automation-rules", [
                'name' => 'Bad rule',
                'trigger_type' => 'form_submitted',
                'actions' => [[
                    'type' => 'move_to_section',
                    'params' => [
                        'section_id' => $this->requests->id,
                        'subsection_mode' => 'period',
                        'period_format' => 'fortnight',
                    ],
                ]],
            ])
            ->assertStatus(422);
    }
}
