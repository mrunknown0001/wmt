<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskMinute;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Finding things by the labels on them.
 *
 * The point of the feature: work you cannot name, filed under a word you can.
 */
class TagSearchTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Project $project;
    private Task $task;
    private TaskMinute $minute;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['manage-projects', 'manage-tasks', 'view-projects', 'view-tasks', 'view-users'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(Permission::all());

        $this->owner = User::factory()->create(['is_active' => true, 'name' => 'Ada']);

        $this->project = Project::create(['name' => 'Hatchery Fit-out', 'status' => 'active', 'owner_id' => $this->owner->id]);
        $this->task = Task::create([
            'project_id' => $this->project->id, 'title' => 'Install feed lines',
            'status' => 'to_do', 'priority' => 'medium', 'assigned_to' => $this->owner->id,
        ]);
        $this->minute = TaskMinute::create([
            'task_id' => $this->task->id,
            'meeting_title' => 'Weekly site walk',
            'meeting_date' => '2026-09-01',
        ]);

        $this->project->syncTagNames(['Biosecurity'], $this->owner->id);
        $this->task->syncTagNames(['Biosecurity', 'Urgent'], $this->owner->id);
        $this->minute->syncTagNames(['Biosecurity'], $this->owner->id);
    }

    private function search(string $q, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->owner)->getJson('/api/search?q=' . urlencode($q));
    }

    public function test_a_label_finds_everything_filed_under_it(): void
    {
        $this->search('biosecurity')
            ->assertOk()
            ->assertJsonCount(1, 'projects')
            ->assertJsonPath('projects.0.name', 'Hatchery Fit-out')
            ->assertJsonCount(1, 'tasks')
            ->assertJsonPath('tasks.0.title', 'Install feed lines')
            ->assertJsonCount(1, 'minutes')
            ->assertJsonPath('minutes.0.title', 'Weekly site walk');
    }

    public function test_the_labels_themselves_come_back_with_a_count(): void
    {
        $this->search('bio')
            ->assertOk()
            ->assertJsonCount(1, 'tags')
            ->assertJsonPath('tags.0.name', 'Biosecurity')
            ->assertJsonPath('tags.0.uses', 3);
    }

    public function test_a_hash_restricts_the_search_to_labels(): void
    {
        // A task whose title contains the word but which is not filed under it.
        Task::create([
            'project_id' => $this->project->id, 'title' => 'Draft the urgent memo',
            'status' => 'to_do', 'priority' => 'medium', 'assigned_to' => $this->owner->id,
        ]);

        $this->search('urgent')
            ->assertOk()
            ->assertJsonCount(2, 'tasks', 'the plain search matches the title too');

        $this->search('#urgent')
            ->assertOk()
            ->assertJsonCount(1, 'tasks')
            ->assertJsonPath('tasks.0.title', 'Install feed lines');
    }

    public function test_a_tag_search_does_not_drag_in_the_other_sections(): void
    {
        $this->search('#biosecurity')
            ->assertOk()
            ->assertJsonCount(0, 'users')
            ->assertJsonCount(0, 'folders')
            ->assertJsonCount(0, 'approvalItems');
    }

    public function test_results_carry_their_labels_so_the_match_is_visible(): void
    {
        $this->search('biosecurity')
            ->assertOk()
            ->assertJsonPath('tasks.0.tags', ['Biosecurity', 'Urgent'])
            ->assertJsonPath('projects.0.tags', ['Biosecurity']);
    }

    public function test_minutes_are_found_by_their_meeting_title_too(): void
    {
        $this->search('site walk')
            ->assertOk()
            ->assertJsonCount(1, 'minutes')
            ->assertJsonPath('minutes.0.task_title', 'Install feed lines')
            ->assertJsonPath('minutes.0.project_name', 'Hatchery Fit-out');
    }

    public function test_a_label_does_not_show_somebody_work_they_cannot_see(): void
    {
        $stranger = User::factory()->create(['is_active' => true]);

        $this->search('biosecurity', $stranger)
            ->assertOk()
            ->assertJsonCount(0, 'projects')
            ->assertJsonCount(0, 'tasks')
            ->assertJsonCount(0, 'minutes')
            // The word itself is not a secret — the work behind it is.
            ->assertJsonCount(1, 'tags');
    }

    public function test_an_admin_sees_it_all(): void
    {
        $admin = User::factory()->create(['is_active' => true]);
        $admin->assignRole('admin');

        $this->search('#biosecurity', $admin)
            ->assertOk()
            ->assertJsonCount(1, 'projects')
            ->assertJsonCount(1, 'tasks')
            ->assertJsonCount(1, 'minutes');
    }

    public function test_a_bare_hash_asks_nothing(): void
    {
        $this->search('#')->assertOk()->assertJsonCount(0, 'tags')->assertJsonCount(0, 'tasks');
        $this->search('#a')->assertOk()->assertJsonCount(0, 'tasks');
    }

    public function test_an_unused_label_is_not_offered(): void
    {
        $this->task->syncTagNames([], $this->owner->id);
        $this->project->syncTagNames([], $this->owner->id);
        $this->minute->syncTagNames([], $this->owner->id);

        $this->search('biosecurity')
            ->assertOk()
            ->assertJsonCount(0, 'tags', 'a word nothing carries is not a way in');
    }
}
