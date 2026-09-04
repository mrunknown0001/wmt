<?php

namespace Tests\Feature;

use App\Console\Commands\MaterialiseMotionEffort;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskMotionSegment;
use App\Models\TaskTimeLog;
use App\Models\User;
use App\Services\MotionEffortGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The clock driving the record.
 *
 * Starting work opens a stretch, pausing and finishing close one, and a closed
 * stretch settles the days it covered. Nobody types a figure in anywhere: the
 * only numbers a person supplies are the pause figure and a correction.
 */
class MotionClockEffortTest extends TestCase
{
    use RefreshDatabase;

    private User $worker;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::create(2026, 9, 8, 17, 0));

        foreach (['manage-projects', 'manage-tasks', 'view-projects', 'view-tasks'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(Permission::all());

        $this->worker = User::factory()->create(['is_active' => true, 'daily_capacity_minutes' => 480]);
        $this->project = Project::create([
            'name' => 'Fit-out', 'status' => 'active', 'owner_id' => $this->worker->id,
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
            'title' => 'Install feed lines',
            'status' => 'to_do',
            'priority' => 'medium',
            'assigned_to' => $this->worker->id,
        ], $attributes));
    }

    public function test_moving_into_progress_opens_a_stretch(): void
    {
        $task = $this->task();

        $this->assertSame(0, TaskMotionSegment::count());

        $task->update(['status' => 'in_progress']);

        $segment = TaskMotionSegment::sole();
        $this->assertSame($task->id, $segment->task_id);
        $this->assertSame($this->worker->id, $segment->user_id);
        $this->assertNull($segment->ended_at, 'the work is still going');
    }

    public function test_the_start_button_opens_one_too_and_pressing_it_twice_does_not(): void
    {
        $task = $this->task();

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/start")
            ->assertOk();

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/start")
            ->assertOk();

        $this->assertSame(1, TaskMotionSegment::count(), 'one stretch, not two');
    }

    public function test_pausing_closes_the_stretch_and_records_what_was_said(): void
    {
        $task = $this->task(['status' => 'in_progress']);

        Carbon::setTestNow(Carbon::create(2026, 9, 8, 17, 30));

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/pause", ['minutes' => 180])
            ->assertOk();

        $segment = TaskMotionSegment::sole();
        $this->assertNotNull($segment->ended_at, 'the stretch is over');

        $log = TaskTimeLog::sole();
        $this->assertSame(180, $log->minutes);
        $this->assertSame(MotionEffortGenerator::DECLARED, $log->source);
        $this->assertSame('2026-09-08', $log->logged_on->toDateString());
    }

    public function test_resuming_opens_a_second_stretch(): void
    {
        $task = $this->task(['status' => 'in_progress']);

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/pause", ['minutes' => 60]);

        Carbon::setTestNow(Carbon::create(2026, 9, 9, 9, 0));

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/resume")
            ->assertOk();

        $this->assertSame(2, TaskMotionSegment::count());
        $this->assertSame(1, TaskMotionSegment::open()->count());
    }

    public function test_finishing_the_task_closes_the_clock_and_settles_the_day(): void
    {
        $task = $this->task(['status' => 'in_progress']);
        TaskMotionSegment::query()->update(['started_at' => '2026-09-08 09:00:00']);

        $task->update(['status' => 'done']);

        $this->assertSame(0, TaskMotionSegment::open()->count(), 'nothing left running');

        $log = TaskTimeLog::sole();
        $this->assertSame(480, $log->minutes, 'nine to five, capped at the working day');
        $this->assertSame(MotionEffortGenerator::MOTION, $log->source);
    }

    public function test_a_task_reopened_puts_the_clock_back_on(): void
    {
        $task = $this->task(['status' => 'in_progress']);
        $task->update(['status' => 'done']);

        $this->assertSame(0, TaskMotionSegment::open()->count());

        $task->update(['status' => 'in_progress']);

        $this->assertSame(1, TaskMotionSegment::open()->count());
        $this->assertSame(2, TaskMotionSegment::count());
    }

    public function test_a_paused_day_is_not_topped_up_by_the_clock(): void
    {
        // Ran all day, paused at five having said it was worth two hours.
        $task = $this->task(['status' => 'in_progress']);
        TaskMotionSegment::query()->update(['started_at' => '2026-09-08 08:00:00']);

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/pause", ['minutes' => 120])
            ->assertOk();

        $this->assertSame(1, TaskTimeLog::count(), 'the statement stands alone');
        $this->assertSame(120, (int) TaskTimeLog::sum('minutes'));
    }

    public function test_the_nightly_pass_settles_a_task_nobody_paused(): void
    {
        $task = $this->task(['status' => 'in_progress']);
        // Started yesterday morning and left running.
        TaskMotionSegment::query()->update(['started_at' => '2026-09-07 09:00:00']);

        $this->assertSame(0, TaskTimeLog::count(), 'nothing settles a day while it is still running');

        $this->artisan('motion:materialise', ['--date' => '2026-09-07'])
            ->expectsOutputToContain('settled 1 person')
            ->assertSuccessful();

        $log = TaskTimeLog::sole();
        $this->assertSame('2026-09-07', $log->logged_on->toDateString());
        $this->assertSame(480, $log->minutes);
    }

    public function test_the_nightly_pass_can_be_run_twice_without_doubling_anything(): void
    {
        $task = $this->task(['status' => 'in_progress']);
        TaskMotionSegment::query()->update(['started_at' => '2026-09-07 09:00:00']);

        $this->artisan('motion:materialise', ['--date' => '2026-09-07'])->assertSuccessful();
        $this->artisan('motion:materialise', ['--date' => '2026-09-07'])->assertSuccessful();

        $this->assertSame(1, TaskTimeLog::count());
    }

    public function test_effort_lands_on_the_task_totals_and_the_panel(): void
    {
        $task = $this->task(['status' => 'in_progress']);
        TaskMotionSegment::query()->update(['started_at' => '2026-09-08 13:00:00']);

        $task->update(['status' => 'done']);

        $this->assertSame(240, $task->fresh()->loggedMinutes());

        $this->actingAs($this->worker)
            ->getJson("/api/tasks/{$task->id}/time-logs")
            ->assertOk()
            ->assertJson([
                'total_minutes' => 240,
                'logs' => [['duration' => '4h', 'generated' => true, 'source' => 'motion']],
            ]);
    }

    public function test_the_timer_and_the_manual_box_are_gone(): void
    {
        $task = $this->task();

        foreach ([
            ['post', '/api/timer/stop'],
            ['post', "/api/tasks/{$task->id}/timer/start"],
            ['get', '/api/timer'],
            // The path survives as a listing; posting an entry to it does not.
            ['post', "/api/tasks/{$task->id}/time-logs"],
        ] as [$method, $url]) {
            $status = $this->actingAs($this->worker)
                ->{$method . 'Json'}($url, [])
                ->getStatusCode();

            $this->assertContains($status, [404, 405], "{$method} {$url} still answers");
        }
    }

    public function test_a_generated_entry_cannot_be_deleted_out_from_under_the_clock(): void
    {
        $task = $this->task(['status' => 'in_progress']);
        TaskMotionSegment::query()->update(['started_at' => '2026-09-08 13:00:00']);
        $task->update(['status' => 'done']);

        $log = TaskTimeLog::sole();

        $this->actingAs($this->worker)
            ->deleteJson("/api/time-logs/{$log->id}")
            ->assertStatus(422);

        $this->assertSame(1, TaskTimeLog::count());
    }

    public function test_a_stated_entry_can_be_deleted_and_the_day_reopens(): void
    {
        $task = $this->task(['status' => 'in_progress']);
        TaskMotionSegment::query()->update(['started_at' => '2026-09-08 08:00:00']);

        $this->actingAs($this->worker)
            ->patchJson("/projects/{$this->project->id}/tasks/{$task->id}/pause", ['minutes' => 120]);

        $declared = TaskTimeLog::sole();

        $this->actingAs($this->worker)
            ->deleteJson("/api/time-logs/{$declared->id}")
            ->assertOk();

        // The statement is gone, so the clock's own account of the day stands
        // again: eight in the morning to five, capped at the working day.
        $this->assertSame(1, TaskTimeLog::count());
        $this->assertSame(MotionEffortGenerator::MOTION, TaskTimeLog::sole()->source);
        $this->assertSame(480, TaskTimeLog::sole()->minutes);
    }
}
