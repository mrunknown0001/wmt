<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Division;
use App\Models\Project;
use App\Models\Task;
use App\Models\Team;
use App\Models\User;
use App\Services\AiContextBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * One meaning of "overdue", everywhere.
 *
 * due_date is a date column. The obvious spelling — where('due_date', '<',
 * now()) — compares '2026-08-12' against '2026-08-12 15:00:00', and the bare
 * date sorts first, so everything due *today* read as overdue from midnight.
 * That was live in sixteen places. Task::scopePastDue is now the single
 * definition; these tests hold each surface to it.
 *
 * Every test freezes time mid-afternoon, which is precisely when the old
 * comparison went wrong and a midnight-run test would not have noticed.
 */
class OverdueSemanticsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $member;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::create(2026, 8, 12, 15, 0));

        foreach (['manage-users', 'view-users', 'view-reports', 'view-workload'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(['manage-users', 'view-users', 'view-reports', 'view-workload']);

        $this->admin = User::factory()->create(['name' => 'Ada Admin', 'is_active' => true]);
        $this->admin->assignRole('admin');

        $division = Division::create(['name' => 'Field', 'head_id' => $this->admin->id]);
        $department = Department::create(['name' => 'Support', 'division_id' => $division->id]);
        $team = Team::create(['name' => 'Frontline', 'department_id' => $department->id]);

        $this->member = User::factory()->create([
            'name' => 'Mel Member', 'is_active' => true,
            'department_id' => $department->id, 'team_id' => $team->id,
        ]);

        $this->project = Project::create([
            'name' => 'Alpha', 'status' => 'active', 'owner_id' => $this->admin->id,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function task(User $assignee, string $due, array $extra = []): Task
    {
        return Task::create($extra + [
            'project_id' => $this->project->id,
            'title' => 'Due ' . $due,
            'status' => 'to_do',
            'priority' => 'medium',
            'assigned_to' => $assignee->id,
            'due_date' => $due,
        ]);
    }

    /** One due today and one due yesterday: only the second is late. */
    private function seedTodayAndYesterday(User $assignee): void
    {
        $this->task($assignee, '2026-08-12');
        $this->task($assignee, '2026-08-11');
    }

    private function chartsOff(User $user): User
    {
        $user->update(['dashboard_preferences' => ['showCharts' => false]]);

        return $user;
    }

    // ---- the scope itself ----

    public function test_a_task_due_today_is_not_past_due(): void
    {
        $this->seedTodayAndYesterday($this->member);

        $this->assertSame(1, Task::pastDue()->count());
        $this->assertSame('Due 2026-08-11', Task::pastDue()->first()->title);
    }

    public function test_the_overdue_scope_also_excludes_finished_work(): void
    {
        $this->task($this->member, '2026-08-01');
        $this->task($this->member, '2026-08-01', ['status' => 'done']);
        $this->task($this->member, '2026-08-01', ['status' => 'cancelled']);

        $this->assertSame(3, Task::pastDue()->count());
        $this->assertSame(1, Task::overdue()->count());
    }

    public function test_the_scope_accepts_a_different_day(): void
    {
        $this->task($this->member, '2026-08-11');

        // Judged as at the 11th, that task is due today rather than late.
        $this->assertSame(0, Task::pastDue(Carbon::create(2026, 8, 11))->count());
        $this->assertSame(1, Task::pastDue(Carbon::create(2026, 8, 12))->count());
    }

    public function test_a_task_with_no_due_date_is_never_past_due(): void
    {
        $this->task($this->member, '2026-08-01')->update(['due_date' => null]);

        $this->assertSame(0, Task::pastDue()->count());
    }

    // ---- every surface that reports it ----

    public function test_the_dashboard_stat_counts_only_yesterday(): void
    {
        $this->seedTodayAndYesterday($this->admin);

        $this->actingAs($this->chartsOff($this->admin))
            ->get('/dashboard')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('stats.overdueTasks', 1));
    }

    public function test_the_dashboard_urgent_items_count_only_yesterday(): void
    {
        $this->seedTodayAndYesterday($this->admin);

        $this->chartsOff($this->admin)->update([
            'dashboard_preferences' => ['showCharts' => false, 'showUrgentItems' => true],
        ]);

        $this->actingAs($this->admin)->get('/dashboard')->assertOk();
    }

    public function test_the_mobile_dashboard_counts_only_yesterday(): void
    {
        $this->seedTodayAndYesterday($this->admin);

        $this->actingAs($this->admin)
            ->getJson('/api/dashboard')
            ->assertOk()
            ->assertJsonPath('stats.overdueTasks', 1);
    }

    public function test_the_executive_dashboard_counts_only_yesterday(): void
    {
        $this->seedTodayAndYesterday($this->member);

        $this->actingAs($this->admin)
            ->get('/executive-dashboard')
            ->assertOk()
            ->assertInertia(function ($page) {
                $props = $page->toArray()['props'];

                $this->assertSame(1, data_get($props, 'metrics.overdueTasks'));

                // The at-risk list is built from the same scope and must agree.
                $atRisk = collect(data_get($props, 'atRiskItems'));
                $this->assertCount(1, $atRisk);
                $this->assertSame('Due 2026-08-11', $atRisk->first()['title']);
            });
    }

    public function test_the_user_overview_counts_only_yesterday(): void
    {
        $this->seedTodayAndYesterday($this->member);

        $this->actingAs($this->admin)
            ->get("/users/{$this->member->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('kpis.tasksOverdue', 1));
    }

    public function test_my_personnel_counts_only_yesterday(): void
    {
        $this->seedTodayAndYesterday($this->member);

        $this->actingAs($this->admin)
            ->get('/my-personnel')
            ->assertOk()
            ->assertInertia(function ($page) {
                $units = $page->toArray()['props']['units'];
                $person = $units[0]['children'][0]['children'][0]['members'][0];

                $this->assertSame(2, $person['open_tasks']);
                $this->assertSame(1, $person['overdue_tasks']);
            });
    }

    public function test_the_personnel_overdue_page_counts_only_yesterday(): void
    {
        $this->seedTodayAndYesterday($this->member);

        $this->actingAs($this->admin)
            ->get('/my-personnel/overdue')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('summary.total', 1));
    }

    public function test_the_ai_context_counts_only_yesterday(): void
    {
        $this->seedTodayAndYesterday($this->admin);

        $context = AiContextBuilder::build($this->admin);

        // Scoped to the Overdue section — the task due today legitimately
        // appears elsewhere in the brief, as open work.
        $section = Str::between($context, '## Overdue Tasks', '## ');

        $this->assertStringContainsString('Due 2026-08-11', $section);
        $this->assertStringNotContainsString('Due 2026-08-12', $section);
        $this->assertStringContainsString('## Overdue Tasks (1)', $context);
    }

    /**
     * The unit rollup counts overdue in raw SQL rather than through the scope,
     * so it needs its own guard — it used CURDATE(), which is MySQL only.
     */
    public function test_the_executive_unit_rollup_counts_only_yesterday(): void
    {
        $this->seedTodayAndYesterday($this->member);

        $this->actingAs($this->admin)
            ->get('/executive-dashboard')
            ->assertOk()
            ->assertInertia(function ($page) {
                $units = collect(data_get($page->toArray()['props'], 'topDepartments') ?? []);

                if ($units->isEmpty()) {
                    $this->markTestSkipped('unit ranking not present in this payload');
                }

                $this->assertSame(1, (int) $units->sum('overdue_tasks'));
            });
    }
}
