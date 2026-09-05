<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskMotionSegment;
use App\Models\TaskTimeLog;
use App\Models\TimeLogAmendment;
use App\Models\User;
use App\Notifications\TimeLogAmendmentRequestedNotification;
use App\Services\MotionEffortGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Asking for an entry on a day the clock never ran.
 *
 * With no manual box left, this is the only way work done away from the app
 * reaches the record — and it goes through the same approval as any other
 * change to it, rather than round the back.
 */
class TimeLogAdditionTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $worker;
    private Project $project;
    private Task $task;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::create(2026, 9, 8, 17, 0));

        foreach (['manage-projects', 'manage-tasks', 'view-projects', 'view-tasks'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(Permission::all());

        $this->owner = User::factory()->create(['is_active' => true, 'name' => 'Ada']);
        $this->worker = User::factory()->create(['is_active' => true, 'name' => 'Bo', 'daily_capacity_minutes' => 480]);

        $this->project = Project::create(['name' => 'Fit-out', 'status' => 'active', 'owner_id' => $this->owner->id]);
        $this->task = Task::create([
            'project_id' => $this->project->id, 'title' => 'Install feed lines',
            'status' => 'to_do', 'priority' => 'medium', 'assigned_to' => $this->worker->id,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function ask(array $overrides = []): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->worker)->postJson("/api/tasks/{$this->task->id}/time-log-amendments", array_merge([
            'duration' => '3h',
            'logged_on' => '2026-09-07',
            'reason' => 'On site all afternoon with no laptop.',
        ], $overrides));
    }

    public function test_a_request_records_nothing_until_it_is_approved(): void
    {
        Notification::fake();

        $this->ask()->assertCreated()->assertJson(['applied' => false]);

        $this->assertSame(0, TaskTimeLog::count(), 'asking is not recording');

        $amendment = TimeLogAmendment::sole();
        $this->assertSame(TimeLogAmendment::ADD, $amendment->kind);
        $this->assertSame($this->task->id, $amendment->task_id);
        $this->assertSame('2026-09-07', $amendment->logged_on->toDateString());
        $this->assertSame(0, $amendment->original_minutes, 'there was nothing there before');
        $this->assertSame(180, $amendment->requested_minutes);

        Notification::assertSentTo($this->owner, TimeLogAmendmentRequestedNotification::class);
    }

    public function test_approving_writes_the_entry_the_clock_never_saw(): void
    {
        $this->ask();
        $amendment = TimeLogAmendment::sole();

        $this->actingAs($this->owner)
            ->postJson("/api/time-log-amendments/{$amendment->id}/approve")
            ->assertOk();

        $log = TaskTimeLog::sole();
        $this->assertSame(180, $log->minutes);
        $this->assertSame('2026-09-07', $log->logged_on->toDateString());
        $this->assertSame($this->worker->id, $log->user_id, 'credited to whoever did the work');
        $this->assertSame(MotionEffortGenerator::MANUAL, $log->source);
        $this->assertNotNull($log->amended_at, 'and never recalculated away');

        // The amendment now points at what it created.
        $this->assertSame($log->id, $amendment->fresh()->task_time_log_id);
    }

    public function test_turning_one_down_leaves_the_day_empty(): void
    {
        $this->ask();
        $amendment = TimeLogAmendment::sole();

        $this->actingAs($this->owner)
            ->postJson("/api/time-log-amendments/{$amendment->id}/reject", ['note' => 'You were on leave.'])
            ->assertOk();

        $this->assertSame(0, TaskTimeLog::count());
        $this->assertSame(TimeLogAmendment::REJECTED, $amendment->fresh()->status);
        $this->assertSame(180, $amendment->fresh()->requested_minutes, 'what was asked for is still on record');
    }

    public function test_an_added_entry_takes_its_share_out_of_the_clocks_day(): void
    {
        // The clock ran all day on another task.
        $other = Task::create([
            'project_id' => $this->project->id, 'title' => 'Other', 'status' => 'to_do',
            'priority' => 'low', 'assigned_to' => $this->worker->id,
        ]);
        TaskMotionSegment::create([
            'task_id' => $other->id, 'user_id' => $this->worker->id,
            'started_at' => '2026-09-07 08:00:00', 'ended_at' => '2026-09-07 18:00:00',
        ]);

        MotionEffortGenerator::forDay($this->worker, Carbon::create(2026, 9, 7));
        $this->assertSame(480, (int) TaskTimeLog::where('task_id', $other->id)->sum('minutes'));

        // Three hours of it were actually spent elsewhere.
        $this->ask();
        $this->actingAs($this->owner)
            ->postJson('/api/time-log-amendments/' . TimeLogAmendment::sole()->id . '/approve')
            ->assertOk();

        $this->assertSame(180, (int) TaskTimeLog::where('task_id', $this->task->id)->sum('minutes'));
        $this->assertSame(300, (int) TaskTimeLog::where('task_id', $other->id)->sum('minutes'), 'the clock gets what is left');
        $this->assertSame(480, (int) TaskTimeLog::whereDate('logged_on', '2026-09-07')->sum('minutes'));
    }

    public function test_a_reviewers_own_entry_needs_nobody_and_still_leaves_a_trail(): void
    {
        Notification::fake();

        $this->actingAs($this->owner)
            ->postJson("/api/tasks/{$this->task->id}/time-log-amendments", [
                'duration' => '90m', 'logged_on' => '2026-09-07', 'reason' => 'Ran the handover call.',
            ])
            ->assertCreated()
            ->assertJson(['applied' => true]);

        $this->assertSame(90, (int) TaskTimeLog::sum('minutes'));
        $this->assertSame($this->owner->id, TaskTimeLog::sole()->user_id);
        $this->assertSame(TimeLogAmendment::APPROVED, TimeLogAmendment::sole()->status);
        Notification::assertNothingSent();
    }

    public function test_the_same_day_cannot_be_asked_for_twice_while_one_is_waiting(): void
    {
        $this->ask()->assertCreated();
        $this->ask()->assertStatus(422);

        $this->assertSame(1, TimeLogAmendment::count());
    }

    public function test_tomorrow_is_not_a_day_anybody_worked(): void
    {
        $this->ask(['logged_on' => '2026-09-09'])->assertStatus(422);
        $this->ask(['duration' => 'a while'])->assertStatus(422);
        $this->ask(['duration' => '25h'])->assertStatus(422);
        $this->ask(['reason' => ''])->assertStatus(422);

        $this->assertSame(0, TimeLogAmendment::count());
    }

    public function test_somebody_with_no_claim_on_the_task_cannot_add_time_to_it(): void
    {
        $stranger = User::factory()->create(['is_active' => true]);

        $this->actingAs($stranger)
            ->postJson("/api/tasks/{$this->task->id}/time-log-amendments", [
                'duration' => '3h', 'logged_on' => '2026-09-07', 'reason' => 'Helping out.',
            ])
            ->assertStatus(403);
    }

    public function test_a_standalone_task_has_nobody_to_approve_an_entry(): void
    {
        $solo = Task::create([
            'project_id' => null, 'title' => 'Personal errand', 'status' => 'to_do',
            'priority' => 'low', 'created_by' => $this->worker->id, 'assigned_to' => $this->worker->id,
        ]);

        $this->actingAs($this->worker)
            ->postJson("/api/tasks/{$solo->id}/time-log-amendments", [
                'duration' => '1h', 'logged_on' => '2026-09-07', 'reason' => 'Ran an errand.',
            ])
            ->assertStatus(403);
    }

    public function test_the_queue_carries_additions_alongside_corrections(): void
    {
        $this->ask();

        // Named guard: the API request above leaves sanctum as the default, and
        // the session middleware on a web route cannot use it.
        $this->actingAs($this->owner, 'web')
            ->get('/time-corrections')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('TimeCorrections/Index', false)
                ->has('amendments.data', 1)
                ->where('amendments.data.0.kind', 'add')
                ->where('amendments.data.0.requested_duration', '3h')
                ->where('amendments.data.0.logged_on', '2026-09-07')
                ->where('amendments.data.0.task_title', 'Install feed lines')
                ->where('amendments.data.0.project_name', 'Fit-out'));
    }
}
