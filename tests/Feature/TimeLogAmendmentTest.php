<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskTimeLog;
use App\Models\TimeLogAmendment;
use App\Models\User;
use App\Notifications\TimeLogAmendmentDecidedNotification;
use App\Notifications\TimeLogAmendmentRequestedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Correcting time that was already recorded.
 *
 * The figures feed effort and estimate-accuracy reporting, so an entry can be
 * changed but not quietly: a reason, and a decision from whoever runs the
 * project. What was asked for survives the decision either way.
 */
class TimeLogAmendmentTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $worker;
    private Project $project;
    private Task $task;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::create(2026, 9, 4, 17, 0));

        foreach (['manage-projects', 'manage-tasks', 'view-projects', 'view-tasks'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(Permission::all());

        $this->owner = User::factory()->create(['is_active' => true, 'name' => 'Ada']);
        $this->worker = User::factory()->create(['is_active' => true, 'name' => 'Bo']);

        $this->project = Project::create([
            'name' => 'Fit-out', 'status' => 'active', 'owner_id' => $this->owner->id,
        ]);

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

    private function log(int $minutes = 120, ?User $user = null): TaskTimeLog
    {
        return TaskTimeLog::create([
            'task_id' => $this->task->id,
            'user_id' => ($user ?? $this->worker)->id,
            'minutes' => $minutes,
            'logged_on' => '2026-09-03',
        ]);
    }

    public function test_a_request_leaves_the_entry_alone_until_it_is_decided(): void
    {
        Notification::fake();
        $log = $this->log(120);

        $this->actingAs($this->worker)
            ->postJson("/api/time-logs/{$log->id}/amendments", [
                'duration' => '3:30',
                'reason' => 'Forgot to stop the timer until the next morning.',
            ])
            ->assertCreated()
            ->assertJson(['applied' => false]);

        $this->assertSame(120, $log->fresh()->minutes, 'nothing changes on the strength of a request');

        $amendment = TimeLogAmendment::sole();
        $this->assertSame(TimeLogAmendment::PENDING, $amendment->status);
        $this->assertSame(120, $amendment->original_minutes);
        $this->assertSame(210, $amendment->requested_minutes);

        // The person who can act on it is told; the requester is not told about
        // their own request.
        Notification::assertSentTo($this->owner, TimeLogAmendmentRequestedNotification::class);
        Notification::assertNotSentTo($this->worker, TimeLogAmendmentRequestedNotification::class);
    }

    public function test_approving_writes_the_new_figure_and_tells_the_requester(): void
    {
        Notification::fake();
        $log = $this->log(120);

        $this->actingAs($this->worker)->postJson("/api/time-logs/{$log->id}/amendments", [
            'duration' => '3:30', 'reason' => 'Timer stopped early.',
        ]);

        $amendment = TimeLogAmendment::sole();

        $this->actingAs($this->owner)
            ->postJson("/api/time-log-amendments/{$amendment->id}/approve", ['note' => 'Checked with the site log.'])
            ->assertOk()
            ->assertJson(['minutes' => 210, 'total_minutes' => 210]);

        $this->assertSame(210, $log->fresh()->minutes);

        $amendment = $amendment->fresh();
        $this->assertSame(TimeLogAmendment::APPROVED, $amendment->status);
        $this->assertSame($this->owner->id, $amendment->reviewed_by);
        $this->assertSame('Checked with the site log.', $amendment->review_note);
        // The original is still readable after the change is applied.
        $this->assertSame(120, $amendment->original_minutes);

        Notification::assertSentTo($this->worker, TimeLogAmendmentDecidedNotification::class);
    }

    public function test_rejecting_leaves_the_entry_as_it_was_but_keeps_the_record(): void
    {
        Notification::fake();
        $log = $this->log(120);

        $this->actingAs($this->worker)->postJson("/api/time-logs/{$log->id}/amendments", [
            'duration' => '8h', 'reason' => 'Felt like a full day.',
        ]);

        $amendment = TimeLogAmendment::sole();

        $this->actingAs($this->owner)
            ->postJson("/api/time-log-amendments/{$amendment->id}/reject", ['note' => 'You were on site half a day.'])
            ->assertOk()
            ->assertJson(['minutes' => 120]);

        $this->assertSame(120, $log->fresh()->minutes);
        $this->assertSame(TimeLogAmendment::REJECTED, $amendment->fresh()->status);
        $this->assertSame(480, $amendment->fresh()->requested_minutes, 'what was asked for is still on record');
    }

    public function test_only_whoever_runs_the_project_may_decide(): void
    {
        $log = $this->log(120);

        $this->actingAs($this->worker)->postJson("/api/time-logs/{$log->id}/amendments", [
            'duration' => '3h', 'reason' => 'Stopped early.',
        ]);

        $amendment = TimeLogAmendment::sole();

        // Not even the person who raised it, when they do not run the project.
        $this->actingAs($this->worker)
            ->postJson("/api/time-log-amendments/{$amendment->id}/approve")
            ->assertStatus(403);

        $stranger = User::factory()->create(['is_active' => true]);
        $this->actingAs($stranger)
            ->postJson("/api/time-log-amendments/{$amendment->id}/approve")
            ->assertStatus(403);

        $this->assertSame(120, $log->fresh()->minutes);
    }

    public function test_a_reviewers_own_correction_applies_at_once_and_is_still_recorded(): void
    {
        Notification::fake();
        // The owner's own entry: they could approve it anyway, so asking
        // themselves for permission would be theatre.
        $log = $this->log(120, $this->owner);

        $this->actingAs($this->owner)
            ->postJson("/api/time-logs/{$log->id}/amendments", [
                'duration' => '90m', 'reason' => 'Left it running over lunch.',
            ])
            ->assertCreated()
            ->assertJson(['applied' => true]);

        $this->assertSame(90, $log->fresh()->minutes);

        $amendment = TimeLogAmendment::sole();
        $this->assertSame(TimeLogAmendment::APPROVED, $amendment->status);
        $this->assertSame($this->owner->id, $amendment->reviewed_by);
        $this->assertSame(120, $amendment->original_minutes);

        // Nobody is notified about a correction that needed no decision.
        Notification::assertNothingSent();
    }

    public function test_one_correction_at_a_time_per_entry(): void
    {
        $log = $this->log(120);

        $this->actingAs($this->worker)->postJson("/api/time-logs/{$log->id}/amendments", [
            'duration' => '3h', 'reason' => 'Stopped early.',
        ])->assertCreated();

        $this->actingAs($this->worker)->postJson("/api/time-logs/{$log->id}/amendments", [
            'duration' => '4h', 'reason' => 'Actually four.',
        ])->assertStatus(422);

        $this->assertSame(1, TimeLogAmendment::count());

        // Once decided, the entry is open to another correction.
        $this->actingAs($this->owner)
            ->postJson('/api/time-log-amendments/' . TimeLogAmendment::sole()->id . '/reject');

        $this->actingAs($this->worker)->postJson("/api/time-logs/{$log->id}/amendments", [
            'duration' => '4h', 'reason' => 'Second attempt.',
        ])->assertCreated();
    }

    public function test_a_decided_correction_cannot_be_decided_again(): void
    {
        $log = $this->log(120);

        $this->actingAs($this->worker)->postJson("/api/time-logs/{$log->id}/amendments", [
            'duration' => '3h', 'reason' => 'Stopped early.',
        ]);

        $amendment = TimeLogAmendment::sole();

        $this->actingAs($this->owner)->postJson("/api/time-log-amendments/{$amendment->id}/approve")->assertOk();
        $this->actingAs($this->owner)->postJson("/api/time-log-amendments/{$amendment->id}/reject")->assertStatus(422);

        $this->assertSame(180, $log->fresh()->minutes, 'the approved figure stands');
    }

    public function test_nonsense_and_no_change_are_refused(): void
    {
        $log = $this->log(120);

        foreach (['duration' => 'about a bit', 'blank' => ''] as $value) {
            $this->actingAs($this->worker)->postJson("/api/time-logs/{$log->id}/amendments", [
                'duration' => $value, 'reason' => 'A reason.',
            ])->assertStatus(422);
        }

        // 25 hours is not a day's work.
        $this->actingAs($this->worker)->postJson("/api/time-logs/{$log->id}/amendments", [
            'duration' => '25h', 'reason' => 'A reason.',
        ])->assertStatus(422);

        // A reason is not optional: the point of the record is why.
        $this->actingAs($this->worker)->postJson("/api/time-logs/{$log->id}/amendments", [
            'duration' => '3h',
        ])->assertStatus(422);

        // And asking for what it already says changes nothing.
        $this->actingAs($this->worker)->postJson("/api/time-logs/{$log->id}/amendments", [
            'duration' => '2h', 'reason' => 'No change at all.',
        ])->assertStatus(422);

        $this->assertSame(0, TimeLogAmendment::count());
    }

    public function test_a_stranger_cannot_amend_somebody_elses_entry(): void
    {
        $log = $this->log(120);
        $stranger = User::factory()->create(['is_active' => true]);

        $this->actingAs($stranger)->postJson("/api/time-logs/{$log->id}/amendments", [
            'duration' => '3h', 'reason' => 'Meddling.',
        ])->assertStatus(403);
    }

    public function test_the_panel_carries_the_pending_correction_and_who_may_decide_it(): void
    {
        $log = $this->log(120);

        $this->actingAs($this->worker)->postJson("/api/time-logs/{$log->id}/amendments", [
            'duration' => '3:30', 'reason' => 'Timer stopped early.',
        ]);

        $this->actingAs($this->worker)
            ->getJson("/api/tasks/{$this->task->id}/time-logs")
            ->assertOk()
            ->assertJson([
                'can_review_amendments' => false,
                'amendments_available' => true,
                'logs' => [[
                    'pending_amendment' => ['requested_duration' => '3h 30m', 'original_duration' => '2h'],
                ]],
            ]);

        $this->actingAs($this->owner)
            ->getJson("/api/tasks/{$this->task->id}/time-logs")
            ->assertOk()
            ->assertJson(['can_review_amendments' => true]);
    }

    public function test_a_standalone_task_has_nobody_to_approve_a_correction(): void
    {
        $solo = Task::create([
            'project_id' => null, 'title' => 'Personal errand',
            'status' => 'to_do', 'priority' => 'low',
            'created_by' => $this->worker->id, 'assigned_to' => $this->worker->id,
        ]);

        $log = TaskTimeLog::create([
            'task_id' => $solo->id, 'user_id' => $this->worker->id,
            'minutes' => 60, 'logged_on' => '2026-09-03',
        ]);

        $this->actingAs($this->worker)->postJson("/api/time-logs/{$log->id}/amendments", [
            'duration' => '2h', 'reason' => 'Ran longer.',
        ])->assertStatus(403);

        $this->actingAs($this->worker)
            ->getJson("/api/tasks/{$solo->id}/time-logs")
            ->assertOk()
            ->assertJson(['amendments_available' => false]);
    }
}
