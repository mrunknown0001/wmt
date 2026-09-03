<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Division;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskTimeLog;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Logged effort on the executive dashboard.
 *
 * The org rolls up division ▸ department ▸ team ▸ person, and effort has to
 * roll up the same way or the levels will disagree with each other. What is
 * asserted here is mostly that: the same hours appearing at every level that
 * contains the person who logged them.
 */
class ExecutiveEffortTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $member;
    private Division $division;
    private Department $department;
    private Team $team;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::create(2026, 9, 15, 9));

        foreach (['manage-users', 'view-projects', 'manage-projects'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(['manage-users', 'view-projects', 'manage-projects']);
        Role::findOrCreate('executive');

        $this->admin = User::factory()->create(['is_active' => true, 'name' => 'Root']);
        $this->admin->assignRole('admin');

        $this->division = Division::create(['name' => 'Ops']);
        $this->department = Department::create(['name' => 'Delivery', 'division_id' => $this->division->id]);
        $this->team = Team::create(['name' => 'Crew', 'department_id' => $this->department->id]);

        $this->member = User::factory()->create([
            'is_active' => true,
            'name' => 'Kit',
            'department_id' => $this->department->id,
            'team_id' => $this->team->id,
        ]);

        $this->project = Project::create([
            'name' => 'Build', 'status' => 'active', 'owner_id' => $this->admin->id,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function task(array $attributes = []): Task
    {
        return Task::create(array_merge([
            'project_id' => $this->project->id,
            'title' => 'A task',
            'status' => 'to_do',
            'priority' => 'medium',
            'assigned_to' => $this->member->id,
        ], $attributes));
    }

    private function log(Task $task, ?int $minutes, string $on, ?User $who = null): void
    {
        TaskTimeLog::create([
            'task_id' => $task->id,
            'user_id' => ($who ?? $this->member)->id,
            'minutes' => $minutes,
            'logged_on' => $on,
            'started_at' => $minutes === null ? now() : null,
        ]);
    }

    public function test_effort_rolls_up_to_every_level_that_contains_the_person(): void
    {
        $task = $this->task();
        $this->log($task, 120, '2026-09-10');
        $this->log($task, 60, '2026-09-11');

        foreach ([
            '/executive-dashboard',
            "/executive-dashboard/divisions/{$this->division->id}",
            "/executive-dashboard/departments/{$this->department->id}",
            "/executive-dashboard/teams/{$this->team->id}",
        ] as $url) {
            $this->actingAs($this->admin)
                ->get($url)
                ->assertOk()
                ->assertInertia(fn ($page) => $page
                    ->where('effort.total_minutes', 180)
                    ->where('effort.entries', 2));
        }
    }

    public function test_each_level_breaks_effort_down_by_the_unit_below_it(): void
    {
        $task = $this->task();
        $this->log($task, 90, '2026-09-12');

        // Overview lists divisions.
        $this->actingAs($this->admin)->get('/executive-dashboard')
            ->assertInertia(fn ($page) => $page->where('divisions.0.logged_minutes', 90));

        // A division lists its departments.
        $this->actingAs($this->admin)->get("/executive-dashboard/divisions/{$this->division->id}")
            ->assertInertia(fn ($page) => $page->where('units.0.logged_minutes', 90));

        // A department lists its teams.
        $this->actingAs($this->admin)->get("/executive-dashboard/departments/{$this->department->id}")
            ->assertInertia(fn ($page) => $page->where('units.0.logged_minutes', 90));

        // A team lists people — the unit below a team is a person.
        $this->actingAs($this->admin)->get("/executive-dashboard/teams/{$this->team->id}")
            ->assertInertia(fn ($page) => $page->where('members.0.logged_minutes', 90));
    }

    public function test_contributors_carry_hours_beside_the_task_count(): void
    {
        $done = $this->task(['status' => 'done']);
        $this->log($done, 240, '2026-09-13');

        $this->actingAs($this->admin)->get('/executive-dashboard')
            ->assertInertia(fn ($page) => $page
                ->where('topContributors.0.name', 'Kit')
                ->where('topContributors.0.count', 1)
                ->where('topContributors.0.minutes', 240));
    }

    public function test_effort_is_dated_by_when_the_work_happened(): void
    {
        $task = $this->task();
        $this->log($task, 300, '2026-08-01');   // outside the window below
        $this->log($task, 45, '2026-09-14');

        // preset=custom is what makes the dashboard read the two dates at all;
        // every other preset computes its own window.
        $this->actingAs($this->admin)
            ->get('/executive-dashboard?preset=custom&date_from=2026-09-01&date_to=2026-09-30')
            ->assertInertia(fn ($page) => $page->where('effort.total_minutes', 45));
    }

    public function test_a_running_timer_is_counted_apart_rather_than_summed(): void
    {
        $task = $this->task();
        $this->log($task, 60, '2026-09-14');
        $this->log($task, null, '2026-09-15');

        $this->actingAs($this->admin)->get('/executive-dashboard')
            ->assertInertia(fn ($page) => $page
                ->where('effort.total_minutes', 60)
                ->where('effort.running', 1));
    }

    public function test_estimate_accuracy_rolls_up_with_its_blind_spot(): void
    {
        // Estimated 2h, took 3h.
        $over = $this->task(['status' => 'done', 'estimated_minutes' => 120]);
        $this->log($over, 180, '2026-09-10');

        // Estimated, finished, nobody logged against it.
        $blind = $this->task(['status' => 'done', 'estimated_minutes' => 120]);

        Task::whereIn('id', [$over->id, $blind->id])->update(['completed_at' => '2026-09-12 10:00:00']);

        $this->actingAs($this->admin)->get('/executive-dashboard')
            ->assertInertia(fn ($page) => $page
                ->where('effort.accuracy.count', 1)
                ->where('effort.accuracy.median_ratio', 1.5)
                ->where('effort.accuracy.over', 1)
                // The half of the picture the ratio cannot speak for.
                ->where('effort.accuracy.estimated_not_logged', 1));

        // And per unit, so a division's ratio can be read against its gaps.
        $this->actingAs($this->admin)->get('/executive-dashboard')
            ->assertInertia(fn ($page) => $page
                ->where('divisions.0.accuracy_ratio', 1.5)
                ->where('divisions.0.estimated_not_logged', 1));
    }

    public function test_nothing_logged_reports_no_ratio_rather_than_zero(): void
    {
        $this->task();

        $this->actingAs($this->admin)->get('/executive-dashboard')
            ->assertInertia(fn ($page) => $page
                ->where('effort.total_minutes', 0)
                ->where('effort.accuracy.median_ratio', null));
    }

    public function test_a_unit_head_sees_effort_for_their_own_unit_only(): void
    {
        $mine = $this->task();
        $this->log($mine, 60, '2026-09-10');

        // Somebody else's team, in another department entirely.
        $otherDept = Department::create(['name' => 'Elsewhere', 'division_id' => $this->division->id]);
        $stranger = User::factory()->create([
            'is_active' => true, 'department_id' => $otherDept->id,
        ]);
        $theirTask = $this->task(['assigned_to' => $stranger->id]);
        $this->log($theirTask, 500, '2026-09-10', $stranger);

        $this->department->update(['head_id' => $this->member->id]);

        $this->actingAs($this->member)
            ->get("/executive-dashboard/departments/{$this->department->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('effort.total_minutes', 60));
    }
}
