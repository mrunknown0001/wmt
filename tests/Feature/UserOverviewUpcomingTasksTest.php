<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * "Upcoming tasks" on the User Overview, for the rest of this week and the rest
 * of this month.
 *
 * Time is frozen in each test — a week that runs past month end, or a run at
 * 23:59, would otherwise make these pass or fail by the clock.
 */
class UserOverviewUpcomingTasksTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $subject;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();

        Permission::findOrCreate('manage-users');
        Role::findOrCreate('admin')->givePermissionTo('manage-users');

        $this->admin = User::factory()->create(['is_active' => true]);
        $this->admin->assignRole('admin');

        $this->subject = User::factory()->create(['name' => 'Sam Subject', 'is_active' => true]);

        $this->project = Project::create([
            'name' => 'Work', 'status' => 'active', 'owner_id' => $this->admin->id,
        ]);
    }

    private function task(?string $due, string $status = 'to_do', array $extra = []): Task
    {
        return Task::create([
            'project_id' => $this->project->id,
            'title' => 'Task due ' . ($due ?? 'never'),
            'status' => $status,
            'priority' => 'medium',
            'assigned_to' => $this->subject->id,
            'due_date' => $due,
        ] + $extra);
    }

    private function upcoming(): array
    {
        $props = [];

        $this->actingAs($this->admin)
            ->get("/users/{$this->subject->id}")
            ->assertOk()
            ->assertInertia(function ($page) use (&$props) {
                $props = $page->toArray()['props']['upcoming'];
            });

        return $props;
    }

    private function titles(array $upcoming, string $bucket): array
    {
        return collect($upcoming['tasks'])
            ->filter(fn ($t) => $t[$bucket])
            ->pluck('title')
            ->sort()->values()->all();
    }

    // ---- the two buckets ----

    public function test_this_week_covers_today_to_saturday(): void
    {
        // A Wednesday. The week it belongs to runs Sun 9th — Sat 15th.
        Carbon::setTestNow(Carbon::create(2026, 8, 12, 9));

        $this->task('2026-08-12');  // today
        $this->task('2026-08-15');  // Saturday, the last day of the week
        $this->task('2026-08-16');  // Sunday, the next week
        $this->task('2026-08-31');  // later in the month

        $upcoming = $this->upcoming();

        $this->assertSame(2, $upcoming['weekCount']);
        $this->assertSame(
            ['Task due 2026-08-12', 'Task due 2026-08-15'],
            $this->titles($upcoming, 'in_week')
        );
    }

    public function test_this_month_runs_to_the_last_day(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 8, 12, 9));

        $this->task('2026-08-12');
        $this->task('2026-08-31');  // last day of August
        $this->task('2026-09-01');  // next month

        $upcoming = $this->upcoming();

        $this->assertSame(2, $upcoming['monthCount']);
        $this->assertSame(
            ['Task due 2026-08-12', 'Task due 2026-08-31'],
            $this->titles($upcoming, 'in_month')
        );
    }

    public function test_the_month_is_a_superset_of_the_week(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 8, 12, 9));

        $this->task('2026-08-13');
        $this->task('2026-08-25');

        $upcoming = $this->upcoming();

        // Everything in the week is also in the month — the two tabs are one
        // list filtered twice, not two lists that double-count.
        foreach ($upcoming['tasks'] as $task) {
            if ($task['in_week']) {
                $this->assertTrue($task['in_month'], "{$task['title']} is in the week but not the month");
            }
        }

        $this->assertSame(1, $upcoming['weekCount']);
        $this->assertSame(2, $upcoming['monthCount']);
    }

    /**
     * The awkward case: late in the month the week spills into the next one.
     *
     * 30 Aug 2026 is a Sunday, so its week ends 5 Sep — past month end. A task
     * due 2 Sep is in the week but not the month, and the range that fetches
     * the list has to reach far enough to include it.
     */
    public function test_a_week_that_runs_past_month_end_still_returns_its_tasks(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 8, 30, 9));

        $this->task('2026-08-31');  // in both
        $this->task('2026-09-02');  // in the week, past the month
        $this->task('2026-09-20');  // in neither

        $upcoming = $this->upcoming();

        $this->assertSame(
            ['Task due 2026-08-31', 'Task due 2026-09-02'],
            $this->titles($upcoming, 'in_week')
        );
        $this->assertSame(['Task due 2026-08-31'], $this->titles($upcoming, 'in_month'));
    }

    // ---- what counts as upcoming ----

    public function test_overdue_tasks_are_not_upcoming(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 8, 12, 9));

        $this->task('2026-08-10');  // two days ago
        $this->task('2026-08-13');

        $upcoming = $this->upcoming();

        $this->assertSame(['Task due 2026-08-13'], $this->titles($upcoming, 'in_week'));
        $this->assertSame(1, $upcoming['weekCount']);
    }

    public function test_a_task_due_today_is_upcoming_even_late_in_the_day(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 8, 12, 23, 45));

        $this->task('2026-08-12');

        $this->assertSame(1, $this->upcoming()['weekCount']);
    }

    public function test_finished_and_cancelled_tasks_are_left_out(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 8, 12, 9));

        $this->task('2026-08-13', 'done');
        $this->task('2026-08-13', 'cancelled');
        $this->task('2026-08-13', 'in_progress');

        $upcoming = $this->upcoming();

        $this->assertSame(1, $upcoming['weekCount']);
        $this->assertCount(1, $upcoming['tasks']);
    }

    public function test_tasks_with_no_due_date_are_left_out(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 8, 12, 9));

        $this->task(null);

        $this->assertSame(0, $this->upcoming()['monthCount']);
    }

    public function test_only_this_persons_tasks_are_counted(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 8, 12, 9));

        $this->task('2026-08-13');

        Task::create([
            'project_id' => $this->project->id, 'title' => 'Somebody else',
            'status' => 'to_do', 'priority' => 'medium',
            'assigned_to' => $this->admin->id, 'due_date' => '2026-08-13',
        ]);

        $this->assertSame(1, $this->upcoming()['weekCount']);
    }

    // ---- ordering and payload ----

    public function test_the_soonest_comes_first_and_timed_tasks_sort_by_hour(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 8, 12, 9));

        $this->task('2026-08-14');
        $this->task('2026-08-13', 'to_do', ['due_time' => '16:00']);
        $this->task('2026-08-13', 'to_do', ['due_time' => '09:00']);
        $this->task('2026-08-13');  // no time — after the timed ones

        // Trimmed to HH:MM the way the card renders it — the stored precision
        // differs between sqlite and MySQL and is not what this test is about.
        $times = collect($this->upcoming()['tasks'])
            ->map(fn ($t) => $t['due_date'] . ' ' . ($t['due_time'] ? substr($t['due_time'], 0, 5) : '—'))
            ->all();

        $this->assertSame([
            '2026-08-13 09:00',
            '2026-08-13 16:00',
            '2026-08-13 —',
            '2026-08-14 —',
        ], $times);
    }

    public function test_each_row_carries_what_the_card_needs(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 8, 12, 9));

        $this->task('2026-08-13');

        $task = $this->upcoming()['tasks'][0];

        $this->assertSame('Work', $task['project']['name']);
        $this->assertSame('medium', $task['priority']);
        $this->assertSame('2026-08-13', $task['due_date']);
        $this->assertNotEmpty($task['url']);
    }

    public function test_the_list_is_capped_but_the_counts_are_not(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 8, 3, 9));

        // 60 tasks spread across August, more than the 50-row cap.
        foreach (range(1, 60) as $i) {
            $this->task('2026-08-' . str_pad((string) (($i % 28) + 3), 2, '0', STR_PAD_LEFT));
        }

        $upcoming = $this->upcoming();

        $this->assertCount(50, $upcoming['tasks']);
        $this->assertSame(60, $upcoming['monthCount']);
        $this->assertSame(50, $upcoming['limit']);
    }

    // ---- access ----

    public function test_a_person_sees_their_own_upcoming_work(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 8, 12, 9));

        $this->task('2026-08-13');

        $this->actingAs($this->subject)
            ->get("/users/{$this->subject->id}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('upcoming.weekCount', 1));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }
}
