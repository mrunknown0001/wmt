<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskTimeLog;
use App\Models\User;
use App\Services\ReportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Logged effort on the reports page.
 *
 * Two figures: how much time went in over the window, and how the estimates
 * compared with it. Both are only worth showing if their exclusions are
 * honest, so most of what is asserted here is what gets left out and whether
 * the report says so.
 */
class ReportEffortTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $mate;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::create(2026, 8, 12, 9));

        foreach (['manage-users', 'view-reports', 'view-projects', 'manage-projects'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(['manage-users', 'view-reports', 'view-projects', 'manage-projects']);

        $this->admin = User::factory()->create(['is_active' => true, 'name' => 'Ada']);
        $this->admin->assignRole('admin');
        $this->mate = User::factory()->create(['is_active' => true, 'name' => 'Bo']);

        $this->project = Project::create([
            'name' => 'Alpha', 'status' => 'active', 'owner_id' => $this->admin->id,
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
            'assigned_to' => $this->admin->id,
        ], $attributes));
    }

    private function log(Task $task, User $user, ?int $minutes, string $on): TaskTimeLog
    {
        return TaskTimeLog::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'minutes' => $minutes,
            'logged_on' => $on,
            'started_at' => $minutes === null ? now() : null,
        ]);
    }

    private function window(): array
    {
        return [Carbon::create(2026, 8, 1)->startOfDay(), Carbon::create(2026, 8, 31)->endOfDay()];
    }

    public function test_effort_totals_the_window_and_splits_it_by_person(): void
    {
        $task = $this->task();

        $this->log($task, $this->admin, 90, '2026-08-03');
        $this->log($task, $this->admin, 30, '2026-08-04');
        $this->log($task, $this->mate, 60, '2026-08-05');

        [$from, $to] = $this->window();
        $effort = ReportService::effort($this->admin, $from, $to);

        $this->assertSame(180, $effort['total_minutes']);
        $this->assertSame(3, $effort['entries']);
        $this->assertCount(2, $effort['people']);

        // Sorted by who put the most in.
        $this->assertSame('Ada', $effort['people'][0]['name']);
        $this->assertSame(120, $effort['people'][0]['minutes']);
        $this->assertSame(2, $effort['people'][0]['entries']);
        $this->assertSame('Bo', $effort['people'][1]['name']);
        $this->assertSame(60, $effort['people'][1]['minutes']);
    }

    public function test_effort_is_dated_by_when_the_work_happened(): void
    {
        $task = $this->task();

        // Typed today, but attributed to July — which is what a manual entry
        // is for, and it must not land in August's total.
        $this->log($task, $this->admin, 120, '2026-07-30');
        $this->log($task, $this->admin, 45, '2026-08-02');

        [$from, $to] = $this->window();
        $effort = ReportService::effort($this->admin, $from, $to);

        $this->assertSame(45, $effort['total_minutes']);
        $this->assertSame(1, $effort['entries']);
    }

    public function test_a_running_timer_is_counted_apart_rather_than_summed(): void
    {
        $task = $this->task();

        $this->log($task, $this->admin, 60, '2026-08-06');
        $this->log($task, $this->admin, null, '2026-08-06');   // still going

        [$from, $to] = $this->window();
        $effort = ReportService::effort($this->admin, $from, $to);

        $this->assertSame(60, $effort['total_minutes'], 'a timer still running has no duration to add');
        $this->assertSame(1, $effort['entries']);
        $this->assertSame(1, $effort['running'], 'but the reader is told it is there');
    }

    public function test_effort_only_covers_work_the_reader_may_see(): void
    {
        $mine = $this->task();
        $this->log($mine, $this->admin, 60, '2026-08-07');

        $theirs = Project::create(['name' => 'Hidden', 'status' => 'active', 'owner_id' => $this->mate->id]);
        $other = Task::create([
            'project_id' => $theirs->id, 'title' => 'Not mine',
            'status' => 'to_do', 'priority' => 'medium', 'assigned_to' => $this->mate->id,
        ]);
        $this->log($other, $this->mate, 300, '2026-08-07');

        [$from, $to] = $this->window();

        // An outsider sees only their own project's effort.
        $outsider = User::factory()->create(['is_active' => true]);
        $seen = ReportService::effort($outsider, $from, $to);
        $this->assertSame(0, $seen['total_minutes']);

        // The admin sees everything.
        $this->assertSame(360, ReportService::effort($this->admin, $from, $to)['total_minutes']);
    }

    public function test_estimate_accuracy_compares_effort_with_the_estimate(): void
    {
        // Estimated 2h, took 3h — half again over.
        $overrun = $this->task(['estimated_minutes' => 120, 'status' => 'done']);
        $this->log($overrun, $this->admin, 180, '2026-08-05');

        // Estimated 2h, took 2h.
        $exact = $this->task(['estimated_minutes' => 120, 'status' => 'done']);
        $this->log($exact, $this->admin, 120, '2026-08-06');

        Task::whereIn('id', [$overrun->id, $exact->id])->update(['completed_at' => '2026-08-10 10:00:00']);

        [$from, $to] = $this->window();
        $accuracy = ReportService::estimateAccuracy($this->admin, $from, $to);

        $this->assertSame(2, $accuracy['count']);
        $this->assertSame(1.25, $accuracy['median_ratio']);   // midpoint of 1.0 and 1.5
        $this->assertSame(1, $accuracy['within_10pct']);
        $this->assertSame(1, $accuracy['over']);
        $this->assertSame(0, $accuracy['under']);
        $this->assertSame(240, $accuracy['estimated_minutes']);
        $this->assertSame(300, $accuracy['logged_minutes']);
    }

    public function test_estimated_work_with_no_logged_time_is_reported_as_the_blind_spot(): void
    {
        $logged = $this->task(['estimated_minutes' => 60, 'status' => 'done']);
        $this->log($logged, $this->admin, 60, '2026-08-05');

        $never = $this->task(['estimated_minutes' => 60, 'status' => 'done']);
        $alsoNever = $this->task(['estimated_minutes' => 60, 'status' => 'done']);

        Task::whereIn('id', [$logged->id, $never->id, $alsoNever->id])
            ->update(['completed_at' => '2026-08-10 10:00:00']);

        [$from, $to] = $this->window();
        $accuracy = ReportService::estimateAccuracy($this->admin, $from, $to);

        // One task cannot speak for three, and the report says which.
        $this->assertSame(1, $accuracy['count']);
        $this->assertSame(2, $accuracy['estimated_not_logged']);
    }

    public function test_an_empty_window_reports_nothing_rather_than_zero(): void
    {
        [$from, $to] = $this->window();
        $accuracy = ReportService::estimateAccuracy($this->admin, $from, $to);

        $this->assertSame(0, $accuracy['count']);
        $this->assertNull($accuracy['median_ratio'], 'no data and a ratio of zero are different answers');
        $this->assertNull($accuracy['average_ratio']);
    }

    public function test_elapsed_accuracy_measures_the_calendar_not_the_timesheet(): void
    {
        // Estimated an hour, sat open for two — and nobody logged a minute
        // against it, which is exactly the case the effort ratio cannot see.
        $slow = $this->task(['estimated_minutes' => 60, 'status' => 'done']);
        Task::whereKey($slow->id)->update([
            'started_at' => '2026-08-10 09:00:00',
            'completed_at' => '2026-08-10 11:00:00',
        ]);

        // Estimated an hour, closed within the hour.
        $brisk = $this->task(['estimated_minutes' => 60, 'status' => 'done']);
        Task::whereKey($brisk->id)->update([
            'started_at' => '2026-08-11 09:00:00',
            'completed_at' => '2026-08-11 10:00:00',
        ]);

        [$from, $to] = $this->window();
        $elapsed = ReportService::elapsedAccuracy($this->admin, $from, $to);

        $this->assertSame(2, $elapsed['count']);
        $this->assertSame(1.5, $elapsed['median_ratio'], 'midpoint of taking twice as long and bang on');
        $this->assertSame(1, $elapsed['over']);
        $this->assertSame(1, $elapsed['within_10pct']);
        $this->assertSame(180, $elapsed['elapsed_minutes']);

        // And it needed no logged time at all to say any of that.
        $this->assertSame(0, ReportService::estimateAccuracy($this->admin, $from, $to)['count']);
    }

    public function test_work_that_was_never_started_has_no_span_to_measure(): void
    {
        $measured = $this->task(['estimated_minutes' => 60, 'status' => 'done']);
        Task::whereKey($measured->id)->update([
            'started_at' => '2026-08-12 09:00:00',
            'completed_at' => '2026-08-12 10:00:00',
        ]);

        // Estimated and finished, but it never passed through In Progress.
        $unstamped = $this->task(['estimated_minutes' => 60, 'status' => 'done']);
        Task::whereKey($unstamped->id)->update(['completed_at' => '2026-08-12 10:00:00']);

        [$from, $to] = $this->window();
        $elapsed = ReportService::elapsedAccuracy($this->admin, $from, $to);

        $this->assertSame(1, $elapsed['count']);
        $this->assertSame(1, $elapsed['estimated_not_started'], 'counted apart rather than dropped');
    }

    public function test_a_completion_before_the_start_is_left_out(): void
    {
        // Somebody correcting dates by hand can leave a task finishing before
        // it began. A negative span is not a fast task.
        $backwards = $this->task(['estimated_minutes' => 60, 'status' => 'done']);
        Task::whereKey($backwards->id)->update([
            'started_at' => '2026-08-14 10:00:00',
            'completed_at' => '2026-08-13 09:00:00',
        ]);

        [$from, $to] = $this->window();
        $elapsed = ReportService::elapsedAccuracy($this->admin, $from, $to);

        $this->assertSame(0, $elapsed['count']);
        $this->assertNull($elapsed['median_ratio']);
    }

    public function test_the_reports_page_carries_both_figures(): void
    {
        $task = $this->task();
        $this->log($task, $this->admin, 90, '2026-08-03');

        $this->actingAs($this->admin)
            ->get('/reports?from=2026-08-01&to=2026-08-31')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->has('effort')
                ->has('estimateAccuracy')
                ->has('elapsedAccuracy')
                ->where('effort.total_minutes', 90));
    }
}
