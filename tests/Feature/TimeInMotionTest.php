<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

/**
 * When work actually began, and how long it ran.
 *
 * Distinct from the plan (start and due dates) and from the time logs (effort
 * spent). This is wall-clock: picked up at X, put down at Y.
 */
class TimeInMotionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Permission::findOrCreate('manage-tasks');
        Permission::findOrCreate('view-projects');
        Permission::findOrCreate('manage-projects');
    }

    private function owner(): User
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->givePermissionTo(['manage-tasks', 'view-projects', 'manage-projects']);

        return $user;
    }

    private function project(User $owner, array $attributes = []): Project
    {
        return Project::create(array_merge([
            'name' => 'Delivery',
            'status' => 'active',
            'owner_id' => $owner->id,
        ], $attributes));
    }

    private function task(Project $project, array $attributes = []): Task
    {
        return Task::create(array_merge([
            'project_id' => $project->id,
            'title' => 'A task',
            'status' => 'to_do',
            'priority' => 'medium',
        ], $attributes));
    }

    public function test_moving_into_progress_stamps_when_work_began(): void
    {
        $project = $this->project($this->owner());
        $task = $this->task($project);

        $this->assertNull($task->started_at);

        $task->update(['status' => 'in_progress']);

        $this->assertNotNull($task->fresh()->started_at);
    }

    /**
     * A task pushed back and picked up again still started when it first
     * started. Re-stamping would quietly shorten every span it appears in.
     */
    public function test_the_first_start_is_the_one_that_sticks(): void
    {
        $project = $this->project($this->owner());
        $task = $this->task($project);

        Carbon::setTestNow('2026-09-01 09:00:00');
        $task->update(['status' => 'in_progress']);
        $first = $task->fresh()->started_at;

        Carbon::setTestNow('2026-09-03 15:00:00');
        $task->update(['status' => 'to_do']);
        $task->update(['status' => 'in_progress']);

        $this->assertTrue($first->equalTo($task->fresh()->started_at));
        Carbon::setTestNow();
    }

    public function test_the_button_starts_the_clock_and_a_second_press_does_not_reset_it(): void
    {
        $owner = $this->owner();
        $project = $this->project($owner);
        $task = $this->task($project);

        Carbon::setTestNow('2026-09-01 09:00:00');
        // The panel redraws itself from this payload rather than reloading the
        // page, so the stamped time has to come back in the response.
        $this->actingAs($owner)
            ->patchJson("/projects/{$project->id}/tasks/{$task->id}/start")
            ->assertOk()
            ->assertJsonPath('started_at', now()->toIso8601String())
            ->assertJsonPath('time_in_motion_minutes', 0);

        $first = $task->fresh()->started_at;
        $this->assertNotNull($first);
        // Still To Do: starting the clock is not a status change.
        $this->assertSame('to_do', $task->fresh()->status);

        Carbon::setTestNow('2026-09-02 09:00:00');
        $this->actingAs($owner)
            ->patchJson("/projects/{$project->id}/tasks/{$task->id}/start")
            ->assertOk();

        $this->assertTrue($first->equalTo($task->fresh()->started_at));
        Carbon::setTestNow();
    }

    public function test_the_elapsed_span_runs_from_start_to_completion(): void
    {
        $project = $this->project($this->owner());

        $task = $this->task($project, [
            'started_at' => Carbon::parse('2026-09-01 09:00:00'),
            'completed_at' => Carbon::parse('2026-09-01 17:30:00'),
        ]);

        $this->assertSame(510, $task->timeInMotionMinutes());
    }

    public function test_an_open_task_counts_up_to_now_and_an_unstarted_one_reports_nothing(): void
    {
        $project = $this->project($this->owner());

        Carbon::setTestNow('2026-09-01 12:00:00');
        $running = $this->task($project, ['started_at' => Carbon::parse('2026-09-01 09:00:00')]);
        $this->assertSame(180, $running->timeInMotionMinutes());

        $this->assertNull($this->task($project)->timeInMotionMinutes());
        Carbon::setTestNow();
    }

    /** Somebody correcting data by hand should not produce a negative span. */
    public function test_a_completion_before_the_start_reports_nothing(): void
    {
        $project = $this->project($this->owner());

        $task = $this->task($project, [
            'started_at' => Carbon::parse('2026-09-02 09:00:00'),
            'completed_at' => Carbon::parse('2026-09-01 09:00:00'),
        ]);

        $this->assertNull($task->timeInMotionMinutes());
    }

    public function test_the_project_setting_is_off_until_it_is_asked_for(): void
    {
        $owner = $this->owner();
        $project = $this->project($owner);

        $this->assertFalse((bool) $project->show_time_in_motion);

        $this->actingAs($owner)->put("/projects/{$project->id}", [
            'name' => $project->name,
            'status' => 'active',
            'show_time_in_motion' => true,
        ])->assertSessionHasNoErrors();

        $this->assertTrue((bool) $project->fresh()->show_time_in_motion);
    }

    public function test_the_quick_view_is_told_whether_to_show_the_panel_and_who_may_use_it(): void
    {
        $owner = $this->owner();
        $project = $this->project($owner, ['show_time_in_motion' => true]);
        $task = $this->task($project);

        // The panel hides its Start buttons unless it is told the viewer can
        // manage the task — which only the full editor used to say.
        $this->actingAs($owner)
            ->getJson("/projects/{$project->id}/tasks/{$task->id}/detail")
            ->assertOk()
            ->assertJsonPath('showTimeInMotion', true)
            ->assertJsonPath('canManageTaskDetails', true);

        $quiet = $this->project($owner, ['name' => 'Untracked']);
        $quietTask = $this->task($quiet);

        $this->actingAs($owner)
            ->getJson("/projects/{$quiet->id}/tasks/{$quietTask->id}/detail")
            ->assertOk()
            ->assertJsonPath('showTimeInMotion', false);
    }

    public function test_somebody_who_cannot_update_the_task_cannot_start_its_clock(): void
    {
        $project = $this->project($this->owner());
        $task = $this->task($project);

        $outsider = User::factory()->create(['is_active' => true]);

        $this->actingAs($outsider)
            ->patchJson("/projects/{$project->id}/tasks/{$task->id}/start")
            ->assertForbidden();

        $this->assertNull($task->fresh()->started_at);
    }
}
