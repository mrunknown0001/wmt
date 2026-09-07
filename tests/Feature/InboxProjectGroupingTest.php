<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Unread notifications gathered under the project they came from.
 *
 * The case this exists for is real: one person on production holds sixty-three
 * unread notifications about a single project, spread across five pages of
 * their inbox. Gathered, that is one line.
 */
class InboxProjectGroupingTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['manage-projects', 'manage-tasks', 'view-projects', 'view-tasks'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(Permission::all());

        $this->user = User::factory()->create(['is_active' => true]);
        $this->project = Project::create(['name' => 'Hatchery Fit-out', 'status' => 'active', 'owner_id' => $this->user->id]);
    }

    /** Put a notification in somebody's inbox, exactly as the app does. */
    private function notify(array $data, array $overrides = []): string
    {
        $id = (string) Str::uuid();

        DB::table('notifications')->insert(array_merge([
            'id' => $id,
            'type' => 'App\\Notifications\\TaskAssignedNotification',
            'notifiable_type' => User::class,
            'notifiable_id' => $this->user->id,
            'data' => json_encode($data),
            'read_at' => null,
            'archived_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));

        return $id;
    }

    private function taskNotification(?Project $project = null, array $data = [], array $overrides = []): string
    {
        $project ??= $this->project;
        $task = Task::create([
            'project_id' => $project->id, 'title' => 'A task',
            'status' => 'to_do', 'priority' => 'medium', 'assigned_to' => $this->user->id,
        ]);

        return $this->notify(array_merge([
            'type' => 'task_assigned',
            'task_id' => $task->id,
            'task_title' => $task->title,
            'project_id' => $project->id,
            'project_name' => $project->name,
            'assigned_by' => 'Ada',
        ], $data), $overrides);
    }

    private function inbox(string $filter = 'inbox')
    {
        return $this->actingAs($this->user)->get('/inbox?filter=' . $filter);
    }

    public function test_several_from_one_project_are_gathered_under_it(): void
    {
        foreach (range(1, 3) as $i) {
            $this->taskNotification();
        }

        $this->inbox()->assertOk()->assertInertia(fn ($page) => $page
            ->has('groups', 1)
            ->where('groups.0.project_id', $this->project->id)
            ->where('groups.0.project_name', 'Hatchery Fit-out')
            ->where('groups.0.unread_count', 3)
            ->has('groups.0.entries', 3)
            // And what the group stands for is not listed underneath it as well.
            ->has('notifications.data', 0));
    }

    public function test_one_on_its_own_is_left_as_a_notification(): void
    {
        $this->taskNotification();

        $this->inbox()->assertOk()->assertInertia(fn ($page) => $page
            ->has('groups', 0)
            ->has('notifications.data', 1));
    }

    public function test_a_read_notification_is_never_gathered(): void
    {
        $this->taskNotification();
        $this->taskNotification();
        $this->taskNotification(null, [], ['read_at' => now()]);

        $this->inbox()->assertOk()->assertInertia(fn ($page) => $page
            ->where('groups.0.unread_count', 2)
            // The read one still shows, on its own, where it always was.
            ->has('notifications.data', 1));
    }

    public function test_an_approval_notification_is_not_filed_under_a_project_of_the_same_number(): void
    {
        // ApprovalItemSharedNotification carries project_id — the id of an
        // *approval* project. Two of them must not become a group under
        // whichever real project happens to share the number.
        foreach (range(1, 3) as $i) {
            $this->notify([
                'type' => 'approval_item_shared',
                'project_id' => $this->project->id,
                'item_title' => 'A request',
                'approval_item_id' => $i,
                'approval_project_id' => $this->project->id,
            ]);
        }

        $this->inbox()->assertOk()->assertInertia(fn ($page) => $page
            ->has('groups', 0)
            ->has('notifications.data', 3));
    }

    public function test_a_standalone_task_belongs_to_no_project_and_so_to_no_group(): void
    {
        foreach (range(1, 3) as $i) {
            $this->notify([
                'type' => 'task_assigned',
                'task_id' => $i,
                'task_title' => 'Personal errand',
                'project_id' => null,
                'assigned_by' => 'Ada',
            ]);
        }

        $this->inbox()->assertOk()->assertInertia(fn ($page) => $page
            ->has('groups', 0)
            ->has('notifications.data', 3));
    }

    public function test_a_deleted_project_keeps_its_notifications_but_loses_the_heading(): void
    {
        $this->taskNotification();
        $this->taskNotification();
        $this->project->forceDelete();

        $this->inbox()->assertOk()->assertInertia(fn ($page) => $page
            ->has('groups', 0)
            ->has('notifications.data', 2));
    }

    public function test_the_heading_uses_the_project_s_name_now_not_the_one_it_was_sent_under(): void
    {
        $this->taskNotification();
        $this->taskNotification();
        $this->project->update(['name' => 'Hatchery Fit-out (Phase 2)']);

        $this->inbox()->assertOk()->assertInertia(fn ($page) => $page
            ->where('groups.0.project_name', 'Hatchery Fit-out (Phase 2)'));
    }

    public function test_two_projects_make_two_groups_newest_first(): void
    {
        $other = Project::create(['name' => 'Cold Chain', 'status' => 'active', 'owner_id' => $this->user->id]);

        $this->taskNotification($this->project, [], ['created_at' => now()->subDay()]);
        $this->taskNotification($this->project, [], ['created_at' => now()->subDay()]);
        $this->taskNotification($other);
        $this->taskNotification($other);

        $this->inbox()->assertOk()->assertInertia(fn ($page) => $page
            ->has('groups', 2)
            ->where('groups.0.project_name', 'Cold Chain')
            ->where('groups.1.project_name', 'Hatchery Fit-out'));
    }

    public function test_the_page_says_how_many_entries_a_group_shows_before_asking(): void
    {
        foreach (range(1, 6) as $i) {
            $this->taskNotification();
        }

        $this->inbox()->assertOk()->assertInertia(fn ($page) => $page
            ->where('collapsedEntries', 4)
            ->where('groups.0.unread_count', 6)
            // Every entry is sent; the four is where the browser stops drawing.
            ->has('groups.0.entries', 6));
    }

    public function test_gathering_happens_on_the_inbox_and_unread_tabs_only(): void
    {
        $this->taskNotification();
        $this->taskNotification();

        foreach (['inbox', 'unread'] as $filter) {
            $this->inbox($filter)->assertOk()->assertInertia(fn ($page) => $page->has('groups', 1));
        }

        foreach (['bookmarked', 'archived', 'mentioned'] as $filter) {
            $this->inbox($filter)->assertOk()->assertInertia(fn ($page) => $page->has('groups', 0));
        }
    }

    public function test_marking_a_group_read_clears_exactly_that_project(): void
    {
        $mine = [$this->taskNotification(), $this->taskNotification()];
        $other = Project::create(['name' => 'Cold Chain', 'status' => 'active', 'owner_id' => $this->user->id]);
        $theirs = $this->taskNotification($other);

        $this->actingAs($this->user)
            ->post("/inbox/projects/{$this->project->id}/read")
            ->assertRedirect();

        foreach ($mine as $id) {
            $this->assertNotNull(DB::table('notifications')->where('id', $id)->value('read_at'));
        }

        $this->assertNull(DB::table('notifications')->where('id', $theirs)->value('read_at'), 'another project is untouched');
    }

    public function test_archiving_a_group_puts_exactly_that_project_away(): void
    {
        $mine = [$this->taskNotification(), $this->taskNotification()];
        $other = Project::create(['name' => 'Cold Chain', 'status' => 'active', 'owner_id' => $this->user->id]);
        $theirs = $this->taskNotification($other);

        $this->actingAs($this->user)
            ->post("/inbox/projects/{$this->project->id}/archive")
            ->assertRedirect();

        foreach ($mine as $id) {
            $this->assertNotNull(DB::table('notifications')->where('id', $id)->value('archived_at'));
        }

        $this->assertNull(DB::table('notifications')->where('id', $theirs)->value('archived_at'));
        $this->inbox()->assertOk()->assertInertia(fn ($page) => $page->has('groups', 0)->has('notifications.data', 1));
    }

    public function test_a_group_action_touches_nobody_else_s_inbox(): void
    {
        $stranger = User::factory()->create(['is_active' => true]);
        $mine = $this->taskNotification();
        $this->taskNotification();

        // The same project, in somebody else's inbox.
        $theirs = (string) Str::uuid();
        DB::table('notifications')->insert([
            'id' => $theirs,
            'type' => 'App\\Notifications\\TaskAssignedNotification',
            'notifiable_type' => User::class,
            'notifiable_id' => $stranger->id,
            'data' => json_encode(['type' => 'task_assigned', 'project_id' => $this->project->id, 'task_id' => 1, 'task_title' => 'x']),
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($this->user)->post("/inbox/projects/{$this->project->id}/read");

        $this->assertNotNull(DB::table('notifications')->where('id', $mine)->value('read_at'));
        $this->assertNull(DB::table('notifications')->where('id', $theirs)->value('read_at'), "somebody else's inbox is not ours to clear");
    }
}
