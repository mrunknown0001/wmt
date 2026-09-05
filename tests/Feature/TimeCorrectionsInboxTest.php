<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskTimeLog;
use App\Models\TimeLogAmendment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The corrections queue.
 *
 * Two lists on one page: what is waiting on you to decide, and what you asked
 * for. The first must contain nothing from a project you do not run — that is
 * the whole guarantee the page makes.
 */
class TimeCorrectionsInboxTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $worker;
    private Project $project;
    private Task $task;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::create(2026, 9, 5, 10));

        foreach (['manage-projects', 'manage-tasks', 'view-projects', 'view-tasks'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(Permission::all());

        $this->owner = User::factory()->create(['is_active' => true, 'name' => 'Ada']);
        $this->worker = User::factory()->create(['is_active' => true, 'name' => 'Bo']);

        $this->project = Project::create(['name' => 'Fit-out', 'status' => 'active', 'owner_id' => $this->owner->id]);
        $this->task = Task::create([
            'project_id' => $this->project->id, 'title' => 'Install feed lines',
            'status' => 'in_progress', 'priority' => 'medium', 'assigned_to' => $this->worker->id,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function amendment(User $requester, Task $task, int $from = 120, int $to = 210, string $status = TimeLogAmendment::PENDING): TimeLogAmendment
    {
        $log = TaskTimeLog::create([
            'task_id' => $task->id, 'user_id' => $requester->id,
            'minutes' => $from, 'logged_on' => '2026-09-04',
        ]);

        return TimeLogAmendment::create([
            'task_time_log_id' => $log->id,
            'requested_by' => $requester->id,
            'original_minutes' => $from,
            'requested_minutes' => $to,
            'reason' => 'Timer stopped early.',
            'status' => $status,
        ]);
    }

    public function test_the_owner_sees_what_is_waiting_on_them(): void
    {
        $this->amendment($this->worker, $this->task);

        $this->actingAs($this->owner)
            ->get('/time-corrections')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                // false: this project keeps its pages in resources/js/Pages,
                // while the package's default finder looks in js/pages — the
                // same reason UserCapabilitiesTest passes false here.
                ->component('TimeCorrections/Index', false)
                ->where('canDecideAny', true)
                ->where('filters.tab', 'to_decide')
                ->where('counts.to_decide', 1)
                ->has('amendments.data', 1)
                ->where('amendments.data.0.requester', 'Bo')
                ->where('amendments.data.0.original_duration', '2h')
                ->where('amendments.data.0.requested_duration', '3h 30m')
                ->where('amendments.data.0.task_title', 'Install feed lines'));
    }

    public function test_the_queue_holds_nothing_from_a_project_you_do_not_run(): void
    {
        // Somebody else's project entirely.
        $stranger = User::factory()->create(['is_active' => true]);
        $theirs = Project::create(['name' => 'Elsewhere', 'status' => 'active', 'owner_id' => $stranger->id]);
        $theirTask = Task::create([
            'project_id' => $theirs->id, 'title' => 'Not mine',
            'status' => 'to_do', 'priority' => 'low', 'assigned_to' => $stranger->id,
        ]);

        $this->amendment($stranger, $theirTask);
        $this->amendment($this->worker, $this->task);

        $this->actingAs($this->owner)
            ->get('/time-corrections')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('amendments.data', 1)
                ->where('amendments.data.0.project_name', 'Fit-out'));
    }

    public function test_a_project_admin_decides_alongside_the_owner(): void
    {
        $admin = User::factory()->create(['is_active' => true]);
        $this->project->members()->attach($admin->id, ['role' => 'admin']);

        // An editor works on the project but does not run it.
        $editor = User::factory()->create(['is_active' => true]);
        $this->project->members()->attach($editor->id, ['role' => 'editor']);

        $this->amendment($this->worker, $this->task);

        $this->actingAs($admin)->get('/time-corrections')->assertOk()
            ->assertInertia(fn ($page) => $page->where('canDecideAny', true)->has('amendments.data', 1));

        $this->actingAs($editor)->get('/time-corrections')->assertOk()
            ->assertInertia(fn ($page) => $page->where('canDecideAny', false)->has('amendments.data', 0));
    }

    public function test_somebody_with_nothing_to_decide_lands_on_their_own_requests(): void
    {
        $this->amendment($this->worker, $this->task);

        $this->actingAs($this->worker)
            ->get('/time-corrections')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('canDecideAny', false)
                ->where('filters.tab', 'mine')
                ->where('counts.mine', 1)
                ->has('amendments.data', 1));

        // And asking for the queue anyway does not smuggle it to them.
        $this->actingAs($this->worker)
            ->get('/time-corrections?tab=to_decide')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('filters.tab', 'mine'));
    }

    public function test_the_status_filter_separates_the_waiting_from_the_decided(): void
    {
        $this->amendment($this->worker, $this->task);
        $this->amendment($this->worker, $this->task, 60, 90, TimeLogAmendment::APPROVED);
        $this->amendment($this->worker, $this->task, 30, 45, TimeLogAmendment::REJECTED);

        $expect = [
            'pending' => 1,
            'approved' => 1,
            'rejected' => 1,
            'all' => 3,
        ];

        foreach ($expect as $status => $count) {
            $this->actingAs($this->owner)
                ->get("/time-corrections?status={$status}")
                ->assertOk()
                ->assertInertia(fn ($page) => $page
                    ->where('filters.status', $status)
                    ->has('amendments.data', $count));
        }
    }

    public function test_the_project_filter_offers_only_projects_that_appear_in_the_list(): void
    {
        $second = Project::create(['name' => 'Second', 'status' => 'active', 'owner_id' => $this->owner->id]);
        $secondTask = Task::create([
            'project_id' => $second->id, 'title' => 'Another', 'status' => 'to_do',
            'priority' => 'low', 'assigned_to' => $this->worker->id,
        ]);

        // A third project the owner runs, with nothing to correct.
        Project::create(['name' => 'Quiet', 'status' => 'active', 'owner_id' => $this->owner->id]);

        $this->amendment($this->worker, $this->task);
        $this->amendment($this->worker, $secondTask);

        $this->actingAs($this->owner)
            ->get('/time-corrections')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('projects', 2));

        $this->actingAs($this->owner)
            ->get("/time-corrections?project={$second->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('amendments.data', 1)
                ->where('amendments.data.0.project_name', 'Second')
                // The dropdown that made the choice still offers both.
                ->has('projects', 2));
    }

    public function test_a_manager_sees_every_project_but_never_a_standalone_task(): void
    {
        $manager = User::factory()->create(['is_active' => true]);
        $manager->assignRole('admin');

        $solo = Task::create([
            'project_id' => null, 'title' => 'Personal errand', 'status' => 'to_do',
            'priority' => 'low', 'created_by' => $this->worker->id, 'assigned_to' => $this->worker->id,
        ]);

        $this->amendment($this->worker, $this->task);
        // Nothing can raise one of these through the controller; built directly
        // to prove the queue would not show it even if one existed.
        $this->amendment($this->worker, $solo);

        $this->actingAs($manager)
            ->get('/time-corrections')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('amendments.data', 1)
                ->where('amendments.data.0.project_name', 'Fit-out'));
    }

    public function test_the_badge_counts_only_what_is_waiting_on_this_person(): void
    {
        $this->amendment($this->worker, $this->task);
        $this->amendment($this->worker, $this->task, 60, 90, TimeLogAmendment::APPROVED);

        $this->actingAs($this->owner)->get('/dashboard')->assertOk()
            ->assertInertia(fn ($page) => $page->where('pendingTimeCorrectionsCount', 1));

        $this->actingAs($this->worker)->get('/dashboard')->assertOk()
            ->assertInertia(fn ($page) => $page->where('pendingTimeCorrectionsCount', 0));
    }

    public function test_deciding_from_the_queue_empties_it(): void
    {
        $amendment = $this->amendment($this->worker, $this->task);

        $this->actingAs($this->owner)
            ->postJson("/api/time-log-amendments/{$amendment->id}/approve", ['note' => 'Fair enough.'])
            ->assertOk();

        // Named guard: authenticating against an API route leaves sanctum as the
        // default, and the session middleware on a web route cannot use it.
        $this->actingAs($this->owner, 'web')
            ->get('/time-corrections')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('amendments.data', 0)->where('counts.to_decide', 0));

        // And it is still readable under the decided filter, with the outcome.
        $this->actingAs($this->owner, 'web')
            ->get('/time-corrections?status=approved')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('amendments.data', 1)
                ->where('amendments.data.0.reviewer', 'Ada')
                ->where('amendments.data.0.review_note', 'Fair enough.')
                ->where('amendments.data.0.current_duration', '3h 30m'));
    }

    public function test_a_guest_is_sent_to_the_login_page(): void
    {
        $this->get('/time-corrections')->assertRedirect('/login');
    }
}
