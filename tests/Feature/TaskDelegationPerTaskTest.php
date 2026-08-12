<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Division;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskDelegation;
use App\Models\TaskDelegationItem;
use App\Models\Team;
use App\Models\User;
use App\Services\TaskDelegationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Covering a single task rather than a person's whole workload, arranged from
 * the User Overview page. Same engine as whole-person cover, so the emphasis
 * here is on the two things that make it different: it moves only its one task,
 * and it never sweeps up anything else the person is holding.
 */
class TaskDelegationPerTaskTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $standIn;
    private User $second;
    private User $teamLead;
    private User $outsider;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();
        Permission::findOrCreate('view-users');

        $this->teamLead = User::factory()->create(['name' => 'Team Lead', 'is_active' => true]);

        $division = Division::create(['name' => 'Field']);
        $support = Department::create(['name' => 'Support', 'division_id' => $division->id]);
        $elsewhere = Department::create(['name' => 'Elsewhere', 'division_id' => $division->id]);
        $frontline = Team::create(['name' => 'Frontline', 'department_id' => $support->id, 'leader_id' => $this->teamLead->id]);
        $otherTeam = Team::create(['name' => 'Other', 'department_id' => $elsewhere->id]);

        $inTeam = ['is_active' => true, 'department_id' => $support->id, 'team_id' => $frontline->id];

        $this->owner = User::factory()->create(['name' => 'Owner'] + $inTeam);
        $this->standIn = User::factory()->create(['name' => 'Stand In'] + $inTeam);
        $this->second = User::factory()->create(['name' => 'Second'] + $inTeam);
        $this->outsider = User::factory()->create([
            'name' => 'Outsider', 'is_active' => true,
            'department_id' => $elsewhere->id, 'team_id' => $otherTeam->id,
        ]);

        $this->project = Project::create(['name' => 'Cover Project', 'status' => 'active', 'owner_id' => $this->owner->id]);
    }

    private function task(?User $assignee = null, string $status = 'to_do', string $title = 'Task'): Task
    {
        return Task::create([
            'project_id' => $this->project->id,
            'title' => $title,
            'status' => $status,
            'priority' => 'medium',
            'assigned_to' => ($assignee ?? $this->owner)->id,
        ]);
    }

    private function taskCover(Task $task, User $delegate, string $from = '-1 day', string $to = '+7 days'): TaskDelegation
    {
        $delegation = TaskDelegation::create([
            'user_id' => $task->assigned_to,
            'task_id' => $task->id,
            'starts_on' => now()->modify($from)->toDateString(),
            'ends_on' => now()->modify($to)->toDateString(),
            'status' => TaskDelegation::SCHEDULED,
        ]);

        $delegation->delegates()->attach($delegate->id, ['position' => 0]);

        return $delegation->fresh('delegates');
    }

    // ---- moving only the one task ----

    public function test_only_the_named_task_moves(): void
    {
        $covered = $this->task(title: 'Covered');
        $left = $this->task(title: 'Left with owner');

        TaskDelegationService::activate($this->taskCover($covered, $this->standIn));

        $this->assertSame($this->standIn->id, $covered->fresh()->assigned_to);
        $this->assertSame($this->owner->id, $left->fresh()->assigned_to);
    }

    public function test_a_finished_task_is_not_handed_over(): void
    {
        $done = $this->task(status: 'done', title: 'Finished');

        $moved = TaskDelegationService::activate($this->taskCover($done, $this->standIn));

        $this->assertSame(0, $moved);
        $this->assertSame($this->owner->id, $done->fresh()->assigned_to);
    }

    public function test_per_task_cover_does_not_sweep_up_other_new_work(): void
    {
        $covered = $this->task(title: 'Covered');
        TaskDelegationService::activate($this->taskCover($covered, $this->standIn));

        // A fresh task assigned to the owner while a single task of theirs is on
        // loan must stay with them — per-task cover is not "this person is away".
        $fresh = $this->task(title: 'Raised meanwhile');

        $this->assertSame($this->owner->id, $fresh->fresh()->assigned_to);
    }

    public function test_per_task_cover_does_not_chain_onto_the_stand_in(): void
    {
        // The stand-in holds the task, then goes away themselves under whole-
        // person cover. The task they are only holding must not chain onward.
        $covered = $this->task(title: 'Covered');
        TaskDelegationService::activate($this->taskCover($covered, $this->standIn));

        $whole = TaskDelegation::create([
            'user_id' => $this->standIn->id,
            'starts_on' => now()->subDay()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
            'status' => TaskDelegation::SCHEDULED,
        ]);
        $whole->delegates()->attach($this->second->id, ['position' => 0]);
        TaskDelegationService::activate($whole->fresh('delegates'));

        $this->assertSame($this->standIn->id, $covered->fresh()->assigned_to);
    }

    // ---- the return trip ----

    public function test_the_task_returns_when_the_period_ends(): void
    {
        $task = $this->task();
        $delegation = $this->taskCover($task, $this->standIn, from: '-5 days', to: '-1 day');
        TaskDelegationService::activate($delegation);
        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);

        TaskDelegationService::processDue();

        $this->assertSame($this->owner->id, $task->fresh()->assigned_to);
        $this->assertSame(TaskDelegation::ENDED, $delegation->fresh()->status);
    }

    public function test_the_task_returns_even_when_it_is_not_yet_due(): void
    {
        $task = $this->task();
        $task->update(['due_date' => now()->addWeek()->toDateString()]);
        $delegation = $this->taskCover($task, $this->standIn);
        TaskDelegationService::activate($delegation);

        $this->actingAs($this->teamLead)
            ->post("/task-delegations/{$delegation->id}/end")
            ->assertRedirect();

        $this->assertSame($this->owner->id, $task->fresh()->assigned_to);
    }

    public function test_a_task_moved_on_by_hand_is_left_where_it_was_put(): void
    {
        $task = $this->task();
        $delegation = $this->taskCover($task, $this->standIn);
        TaskDelegationService::activate($delegation);

        $task->fresh()->update(['assigned_to' => $this->second->id]);

        $this->actingAs($this->teamLead)
            ->post("/task-delegations/{$delegation->id}/end")
            ->assertRedirect();

        $this->assertSame($this->second->id, $task->fresh()->assigned_to);
    }

    // ---- the endpoint ----

    public function test_a_leader_can_reassign_one_task_of_their_person(): void
    {
        $task = $this->task();

        $this->actingAs($this->teamLead)->post('/task-delegations/task', [
            'task_id' => $task->id,
            'delegate_id' => $this->standIn->id,
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertRedirect();

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
        $this->assertDatabaseHas('task_delegations', ['task_id' => $task->id, 'user_id' => $this->owner->id]);
    }

    public function test_an_ordinary_member_cannot_reassign_a_task(): void
    {
        $task = $this->task();

        $this->actingAs($this->owner)->post('/task-delegations/task', [
            'task_id' => $task->id,
            'delegate_id' => $this->standIn->id,
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertForbidden();
    }

    public function test_a_leader_cannot_reassign_a_task_outside_their_scope(): void
    {
        $task = $this->task($this->outsider);

        $this->actingAs($this->teamLead)->post('/task-delegations/task', [
            'task_id' => $task->id,
            'delegate_id' => $this->standIn->id,
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertForbidden();
    }

    public function test_the_stand_in_must_be_within_scope(): void
    {
        $task = $this->task();

        $this->actingAs($this->teamLead)->post('/task-delegations/task', [
            'task_id' => $task->id,
            'delegate_id' => $this->outsider->id,
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertSessionHasErrors('delegate_id');
    }

    public function test_a_task_already_on_loan_cannot_be_reassigned_again(): void
    {
        $task = $this->task();
        TaskDelegationService::activate($this->taskCover($task, $this->standIn));

        $this->actingAs($this->teamLead)->post('/task-delegations/task', [
            'task_id' => $task->id,
            'delegate_id' => $this->second->id,
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertSessionHasErrors('starts_on');
    }

    public function test_ending_early_from_the_endpoint_returns_the_task(): void
    {
        $task = $this->task();

        $this->actingAs($this->teamLead)->post('/task-delegations/task', [
            'task_id' => $task->id,
            'delegate_id' => $this->standIn->id,
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertRedirect();

        $delegation = TaskDelegation::whereNotNull('task_id')->firstOrFail();

        $this->actingAs($this->teamLead)
            ->post("/task-delegations/{$delegation->id}/end")
            ->assertRedirect();

        $this->assertSame($this->owner->id, $task->fresh()->assigned_to);
    }

    // ---- the User Overview ----

    public function test_the_overview_offers_cover_to_a_manager(): void
    {
        $this->actingAs($this->teamLead)
            ->get("/users/{$this->owner->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('canArrangeCover', true)
                ->has('coverPeople'));
    }

    public function test_the_overview_does_not_offer_cover_to_a_peer(): void
    {
        // Able to read the overview, but leading nothing — so no cover controls.
        $this->owner->givePermissionTo('view-users');

        $this->actingAs($this->owner)
            ->get("/users/{$this->standIn->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('canArrangeCover', false));
    }

    public function test_a_clicked_card_returns_the_matching_tasks(): void
    {
        $this->task(status: 'done', title: 'Done one');
        $this->task(status: 'to_do', title: 'Still open');

        $this->actingAs($this->teamLead)
            ->get("/users/{$this->owner->id}?filter=completed")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('filtered.type', 'tasks')
                ->where('filtered.count', 1)
                ->where('filtered.items.0.title', 'Done one'));
    }

    public function test_a_reassigned_task_shows_as_temporarily_out(): void
    {
        $task = $this->task(title: 'On loan');
        TaskDelegationService::activate($this->taskCover($task, $this->standIn));

        $this->actingAs($this->teamLead)
            ->get("/users/{$this->owner->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('delegatedAway', 1)
                ->where('delegatedAway.0.task.title', 'On loan')
                ->where('delegatedAway.0.delegate', 'Stand In')
                ->where('delegatedAway.0.per_task', true));
    }
}
