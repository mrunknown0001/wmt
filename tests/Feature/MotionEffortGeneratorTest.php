<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskMotionSegment;
use App\Models\TaskTimeLog;
use App\Models\User;
use App\Services\MotionEffortGenerator;
use App\Services\TimeTracker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Turning the clock into a day's effort.
 *
 * The rule under test: a person's day is shared out among the tasks whose
 * clocks were running, in proportion to how long each ran, and never adds up to
 * more than the day they had. What they said themselves comes first.
 */
class MotionEffortGeneratorTest extends TestCase
{
    use RefreshDatabase;

    private User $worker;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::create(2026, 9, 8, 18, 0));   // Tuesday evening

        foreach (['manage-projects', 'manage-tasks', 'view-projects', 'view-tasks'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(Permission::all());

        $this->worker = User::factory()->create(['is_active' => true, 'daily_capacity_minutes' => 480]);
        $this->project = Project::create(['name' => 'Fit-out', 'status' => 'active', 'owner_id' => $this->worker->id]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function task(string $title = 'A task'): Task
    {
        return Task::create([
            'project_id' => $this->project->id, 'title' => $title,
            'status' => 'to_do', 'priority' => 'medium', 'assigned_to' => $this->worker->id,
        ]);
    }

    private function segment(Task $task, string $from, ?string $to): TaskMotionSegment
    {
        return TaskMotionSegment::create([
            'task_id' => $task->id,
            'user_id' => $this->worker->id,
            'started_at' => $from,
            'ended_at' => $to,
        ]);
    }

    private function day(): Carbon
    {
        return Carbon::create(2026, 9, 8);
    }

    private function generated(): array
    {
        return TaskTimeLog::where('user_id', $this->worker->id)
            ->orderBy('task_id')
            ->get()
            ->mapWithKeys(fn ($l) => [$l->task_id => $l->minutes])
            ->all();
    }

    public function test_one_clock_under_a_days_capacity_is_taken_at_face_value(): void
    {
        $task = $this->task();
        $this->segment($task, '2026-09-08 09:00:00', '2026-09-08 12:30:00');

        MotionEffortGenerator::forDay($this->worker, $this->day());

        $this->assertSame([$task->id => 210], $this->generated());
        $this->assertSame(MotionEffortGenerator::MOTION, TaskTimeLog::sole()->source);
    }

    public function test_two_clocks_over_the_day_are_scaled_in_proportion(): void
    {
        $long = $this->task('Long');
        $short = $this->task('Short');

        // Nine hours and six: fifteen hours of clock in an eight-hour day.
        $this->segment($long, '2026-09-08 08:00:00', '2026-09-08 17:00:00');
        $this->segment($short, '2026-09-08 09:00:00', '2026-09-08 15:00:00');

        MotionEffortGenerator::forDay($this->worker, $this->day());

        $out = $this->generated();

        $this->assertSame(480, array_sum($out), 'the day is not stretched to fit the clocks');
        // 540 and 360 of 900, scaled to 480: 288 and 192.
        $this->assertSame(288, $out[$long->id]);
        $this->assertSame(192, $out[$short->id]);
    }

    public function test_two_clocks_inside_the_day_are_both_left_alone(): void
    {
        $one = $this->task('One');
        $two = $this->task('Two');

        $this->segment($one, '2026-09-08 09:00:00', '2026-09-08 11:00:00');
        $this->segment($two, '2026-09-08 13:00:00', '2026-09-08 16:00:00');

        MotionEffortGenerator::forDay($this->worker, $this->day());

        $this->assertSame([$one->id => 120, $two->id => 180], $this->generated());
    }

    public function test_what_somebody_said_is_taken_as_given_and_comes_off_the_day(): void
    {
        $declared = $this->task('Declared');
        $inferred = $this->task('Inferred');

        // Paused with a figure: two hours, and that task is settled.
        TimeTracker::declare($declared, $this->worker, 120, '2026-09-08');
        $this->segment($declared, '2026-09-08 08:00:00', '2026-09-08 14:00:00');

        // The other ran all day and takes what is left of it.
        $this->segment($inferred, '2026-09-08 08:00:00', '2026-09-08 18:00:00');

        MotionEffortGenerator::forDay($this->worker, $this->day());

        $out = $this->generated();
        $this->assertSame(120, $out[$declared->id], 'the statement is not revised');
        $this->assertSame(360, $out[$inferred->id], 'and the rest of the day is what is left');
        $this->assertSame(480, array_sum($out));
    }

    public function test_a_day_spoken_for_entirely_generates_nothing_more(): void
    {
        $task = $this->task();
        $other = $this->task('Other');

        TimeTracker::declare($task, $this->worker, 480, '2026-09-08');
        $this->segment($task, '2026-09-08 08:00:00', '2026-09-08 18:00:00');
        $this->segment($other, '2026-09-08 08:00:00', '2026-09-08 18:00:00');

        MotionEffortGenerator::forDay($this->worker, $this->day());

        $this->assertSame([$task->id => 480], $this->generated());
    }

    public function test_a_stretch_across_midnight_is_settled_day_by_day(): void
    {
        $task = $this->task();
        // Monday 15:00 to Tuesday 11:00, never paused.
        $segment = $this->segment($task, '2026-09-07 15:00:00', '2026-09-08 11:00:00');

        MotionEffortGenerator::forSegment($segment);

        $rows = TaskTimeLog::orderBy('logged_on')->get();
        $this->assertCount(2, $rows);
        $this->assertSame('2026-09-07', $rows[0]->logged_on->toDateString());
        // Monday ran three in the afternoon to midnight — nine hours of clock,
        // which is still only a day's work.
        $this->assertSame(480, $rows[0]->minutes);
        $this->assertSame('2026-09-08', $rows[1]->logged_on->toDateString());
        $this->assertSame(480, $rows[1]->minutes, 'Tuesday capped at the working day');
    }

    public function test_an_open_clock_counts_only_up_to_now(): void
    {
        $task = $this->task();
        $this->segment($task, '2026-09-08 09:00:00', null);   // still running, now 18:00

        MotionEffortGenerator::forDay($this->worker, $this->day());

        $this->assertSame([$task->id => 480], $this->generated(), 'nine hours capped at the day');

        // And a past day does not keep growing because the clock is still on.
        $this->segment($this->task('Other'), '2026-09-07 09:00:00', null);
        MotionEffortGenerator::forDay($this->worker, Carbon::create(2026, 9, 7));

        $this->assertSame(480, (int) TaskTimeLog::whereDate('logged_on', '2026-09-07')->sum('minutes'));
    }

    public function test_running_it_again_produces_the_same_answer_rather_than_a_second_entry(): void
    {
        $task = $this->task();
        $this->segment($task, '2026-09-08 09:00:00', '2026-09-08 12:00:00');

        MotionEffortGenerator::forDay($this->worker, $this->day());
        MotionEffortGenerator::forDay($this->worker, $this->day());
        MotionEffortGenerator::forDay($this->worker, $this->day());

        $this->assertSame(1, TaskTimeLog::count());
        $this->assertSame(180, TaskTimeLog::sole()->minutes);
    }

    public function test_a_second_task_started_later_redraws_the_day(): void
    {
        $first = $this->task('First');
        $this->segment($first, '2026-09-08 08:00:00', '2026-09-08 18:00:00');

        MotionEffortGenerator::forDay($this->worker, $this->day());
        $this->assertSame([$first->id => 480], $this->generated());

        // A second clock starts; the day it already recorded was not the whole
        // story, and the figure moves.
        $second = $this->task('Second');
        $this->segment($second, '2026-09-08 08:00:00', '2026-09-08 18:00:00');

        MotionEffortGenerator::forDay($this->worker, $this->day());
        $this->assertSame([$first->id => 240, $second->id => 240], $this->generated());
    }

    public function test_an_approved_correction_is_never_recalculated_away(): void
    {
        $task = $this->task();
        $this->segment($task, '2026-09-08 09:00:00', '2026-09-08 12:00:00');

        MotionEffortGenerator::forDay($this->worker, $this->day());
        $log = TaskTimeLog::sole();

        // The figure was argued for and approved.
        $log->update(['minutes' => 300, 'amended_at' => now()]);

        MotionEffortGenerator::forDay($this->worker, $this->day());

        $this->assertSame(300, $log->fresh()->minutes);
        $this->assertSame(1, TaskTimeLog::count());
    }

    public function test_a_stretch_that_no_longer_exists_takes_its_entry_with_it(): void
    {
        $task = $this->task();
        $segment = $this->segment($task, '2026-09-08 09:00:00', '2026-09-08 12:00:00');

        MotionEffortGenerator::forDay($this->worker, $this->day());
        $this->assertSame(1, TaskTimeLog::count());

        $segment->delete();
        MotionEffortGenerator::forDay($this->worker, $this->day());

        $this->assertSame(0, TaskTimeLog::count());
    }

    public function test_somebody_with_no_capacity_of_their_own_gets_a_working_day(): void
    {
        $casual = User::factory()->create(['is_active' => true, 'daily_capacity_minutes' => 0]);
        $task = $this->task();
        TaskMotionSegment::create([
            'task_id' => $task->id, 'user_id' => $casual->id,
            'started_at' => '2026-09-08 06:00:00', 'ended_at' => '2026-09-08 18:00:00',
        ]);

        MotionEffortGenerator::forDay($casual, $this->day());

        $this->assertSame(
            MotionEffortGenerator::DEFAULT_CAPACITY_MINUTES,
            (int) TaskTimeLog::where('user_id', $casual->id)->sum('minutes'),
        );
    }

    public function test_work_on_a_saturday_is_still_work(): void
    {
        $task = $this->task();
        // Saturday 12 September.
        $this->segment($task, '2026-09-12 09:00:00', '2026-09-12 13:00:00');

        MotionEffortGenerator::forDay($this->worker, Carbon::create(2026, 9, 12));

        $this->assertSame(240, (int) TaskTimeLog::whereDate('logged_on', '2026-09-12')->sum('minutes'));
    }

    public function test_a_clock_with_nobody_holding_it_credits_nobody(): void
    {
        $task = $this->task();
        $task->update(['assigned_to' => null]);

        TaskMotionSegment::create([
            'task_id' => $task->id, 'user_id' => null,
            'started_at' => '2026-09-08 09:00:00', 'ended_at' => '2026-09-08 12:00:00',
        ]);

        MotionEffortGenerator::forDay($this->worker, $this->day());

        $this->assertSame(0, TaskTimeLog::count());
    }

    public function test_the_rounding_remainder_lands_on_the_largest_share(): void
    {
        // Three clocks, 7h, 5h and 3h — 900 minutes into 480 does not divide.
        $a = $this->task('A');
        $b = $this->task('B');
        $c = $this->task('C');
        $this->segment($a, '2026-09-08 08:00:00', '2026-09-08 15:00:00');
        $this->segment($b, '2026-09-08 09:00:00', '2026-09-08 14:00:00');
        $this->segment($c, '2026-09-08 10:00:00', '2026-09-08 13:00:00');

        MotionEffortGenerator::forDay($this->worker, $this->day());

        $out = $this->generated();
        $this->assertSame(480, array_sum($out), 'the day adds up exactly');
        $this->assertGreaterThan($out[$b->id], $out[$a->id]);
        $this->assertGreaterThan($out[$c->id], $out[$b->id]);
    }
}
