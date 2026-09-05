<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskMotionSegment;
use App\Models\TaskTimeLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Putting a task's clock down for the day.
 *
 * Time in motion counts wall-clock, which turns a fortnight-long task into a
 * fortnight of "work". Pausing is the correction: the day's hours are recorded
 * as effort, and the nights in between stop counting.
 */
class TaskMotionPauseTest extends TestCase
{
    use RefreshDatabase;

    private User $worker;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::create(2026, 9, 4, 17, 0));

        foreach (['manage-projects', 'manage-tasks', 'view-projects', 'view-tasks'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(Permission::all());

        $this->worker = User::factory()->create(['is_active' => true, 'daily_capacity_minutes' => 480]);
        $this->project = Project::create([
            'name' => 'Fit-out', 'status' => 'active', 'owner_id' => $this->worker->id,
            'show_time_in_motion' => true,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function task(array $attributes = []): Task
    {
        $task = Task::create(array_merge([
            'project_id' => $this->project->id,
            'title' => 'Install feed lines',
            'status' => 'in_progress',
            'priority' => 'medium',
            'assigned_to' => $this->worker->id,
        ], $attributes));

        // Written past the model so the status hook does not stamp its own
        // times over the ones a test is setting up. The stretch of work the
        // task opened on the way into progress is moved back with it: it is the
        // record of when the clock started, so leaving it at "now" would make a
        // task that began last week look like one that began this second.
        Task::whereKey($task->id)->update(['started_at' => '2026-09-02 09:00:00']);
        TaskMotionSegment::where('task_id', $task->id)->update(['started_at' => '2026-09-02 09:00:00']);

        return $task->fresh();
    }

    public function test_pausing_records_the_day_as_effort_and_stops_the_clock(): void
    {
        $task = $this->task();

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/pause", ['minutes' => 300, 'note' => 'Ran the second line'])
            ->assertOk()
            ->assertJson(['logged_minutes' => 300]);

        // Today is what the pause was about. The days before it were settled
        // at the same time — the clock ran through them — so this asks about
        // the day rather than the only entry on the task.
        $log = TaskTimeLog::where('task_id', $task->id)->whereDate('logged_on', '2026-09-04')->sole();
        $this->assertSame(300, $log->minutes);
        $this->assertSame('Ran the second line', $log->note);
        $this->assertSame($this->worker->id, $log->user_id);
        $this->assertSame('declared', $log->source, 'a figure somebody stated, not one the clock inferred');

        $this->assertNotNull($task->fresh()->motion_paused_at, 'the clock is down');
    }

    public function test_time_in_motion_stops_while_the_task_is_paused(): void
    {
        $task = $this->task();

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/pause", ['minutes' => 300]);

        $atPause = $task->fresh()->timeInMotionMinutes();

        // Overnight. Without a pause this would add 960 minutes of "motion".
        Carbon::setTestNow(Carbon::create(2026, 9, 5, 9, 0));

        $this->assertSame($atPause, $task->fresh()->timeInMotionMinutes(), 'a paused task is not in motion');
    }

    public function test_resuming_starts_a_fresh_stretch_and_keeps_the_pause_out_of_the_total(): void
    {
        $task = $this->task();

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/pause", ['minutes' => 300]);

        Carbon::setTestNow(Carbon::create(2026, 9, 5, 9, 0));   // 16 hours later

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/resume")
            ->assertOk()
            ->assertJson(['motion_paused_at' => null, 'motion_paused_minutes' => 960]);

        $task = $task->fresh();
        $this->assertSame('2026-09-05 09:00:00', $task->motion_resumed_at->toDateTimeString());

        // Started 09:00 on the 2nd, now 09:00 on the 5th: 4,320 minutes of
        // wall-clock, of which 960 were spent paused.
        $this->assertSame(4320 - 960, $task->timeInMotionMinutes());
    }

    public function test_the_suggested_figure_measures_this_stretch_not_the_whole_span(): void
    {
        $task = $this->task();

        // Two days in, so counting from the start would offer 3,360 minutes.
        $this->actingAs($this->worker)
            ->getJson("/projects/{$this->project->id}/tasks/{$task->id}/pause-preview")
            ->assertOk()
            // Midnight to 17:00 is 1,020, capped at the person's 8-hour day.
            ->assertJson(['suggested_minutes' => 480]);

        // Resumed at two this afternoon: three hours, and no cap needed.
        Task::whereKey($task->id)->update(['motion_resumed_at' => '2026-09-04 14:00:00']);
        TaskMotionSegment::where('task_id', $task->id)->update(['started_at' => '2026-09-04 14:00:00']);

        $this->actingAs($this->worker)
            ->getJson("/projects/{$this->project->id}/tasks/{$task->id}/pause-preview")
            ->assertOk()
            ->assertJson(['suggested_minutes' => 180]);
    }

    public function test_saying_the_day_was_worth_nothing_is_recorded_as_nothing(): void
    {
        $task = $this->task();

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/pause", ['minutes' => 0])
            ->assertOk();

        // The statement goes on the record even though it is zero. Without it
        // the generator would see a clock that ran all day and infer a day's
        // work from it — the opposite of what was just said.
        $log = TaskTimeLog::where('task_id', $task->id)->whereDate('logged_on', '2026-09-04')->sole();
        $this->assertSame(0, $log->minutes);
        $this->assertSame('declared', $log->source);
        $this->assertNotNull($task->fresh()->motion_paused_at);
    }

    public function test_a_task_cannot_be_paused_twice_or_before_it_starts(): void
    {
        $task = $this->task();

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/pause", ['minutes' => 60])
            ->assertOk();

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/pause", ['minutes' => 60])
            ->assertStatus(422);

        $unstarted = Task::create([
            'project_id' => $this->project->id, 'title' => 'Not begun',
            'status' => 'to_do', 'priority' => 'low', 'assigned_to' => $this->worker->id,
        ]);

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$unstarted->id}/pause", ['minutes' => 60])
            ->assertStatus(422);

        // And today was recorded once — the refusals wrote nothing.
        $this->assertSame(1, TaskTimeLog::whereDate('logged_on', '2026-09-04')->count());
    }

    public function test_somebody_with_no_claim_on_the_task_cannot_pause_it(): void
    {
        $task = $this->task();
        $stranger = User::factory()->create(['is_active' => true]);

        $this->actingAs($stranger)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/pause", ['minutes' => 60])
            ->assertStatus(403);
    }

    public function test_a_paused_task_that_is_finished_counts_the_pause_only_up_to_completion(): void
    {
        $task = $this->task();

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/pause", ['minutes' => 300]);

        // Closed the next morning, having sat paused for 16 hours.
        Carbon::setTestNow(Carbon::create(2026, 9, 5, 9, 0));
        Task::whereKey($task->id)->update(['completed_at' => '2026-09-05 09:00:00', 'status' => 'done']);

        $frozen = $task->fresh()->timeInMotionMinutes();

        // A week later it still reads the same: a finished task's span does not
        // grow, and the pause it ended on is not counted past its completion.
        Carbon::setTestNow(Carbon::create(2026, 9, 12, 9, 0));
        $this->assertSame($frozen, $task->fresh()->timeInMotionMinutes());
        $this->assertSame(4320 - 960, $frozen);
    }
}
