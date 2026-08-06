<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskDelegation;
use App\Models\TaskDelegationItem;
use App\Models\User;
use App\Services\TaskDelegationService;
use App\Services\TaskHandover;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Handing a departed person's open work to somebody else, permanently.
 *
 * The easy part is moving the tasks. The part worth testing is what it does to
 * task cover: a leaver may be holding somebody else's work, or have somebody
 * holding theirs, and the ledger those arrangements read from records people by
 * id. Move the tasks without moving the ledger and the hand-back silently
 * declines months later.
 */
class TaskHandoverTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $leaver;
    private User $successor;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();

        foreach (['manage-users', 'view-users'] as $name) {
            Permission::findOrCreate($name);
        }
        Role::findOrCreate('admin')->syncPermissions(['manage-users', 'view-users']);

        $this->admin = User::factory()->create(['name' => 'Ada Admin', 'is_active' => true]);
        $this->admin->assignRole('admin');

        $this->leaver = User::factory()->create(['name' => 'Lee Leaver', 'is_active' => true]);
        $this->successor = User::factory()->create(['name' => 'Sam Successor', 'is_active' => true]);

        $this->project = Project::create([
            'name' => 'Ongoing', 'status' => 'active', 'owner_id' => $this->admin->id,
        ]);
    }

    private function task(User $assignee, string $status = 'to_do', string $title = 'Task'): Task
    {
        return Task::create([
            'project_id' => $this->project->id,
            'title' => $title,
            'status' => $status,
            'priority' => 'medium',
            'assigned_to' => $assignee->id,
        ]);
    }

    private function transfer(?User $actor = null)
    {
        return $this->actingAs($actor ?? $this->admin)->post(
            "/users/{$this->leaver->id}/transfer-tasks",
            ['to_user_id' => $this->successor->id]
        );
    }

    // ---- who may do it ----

    public function test_an_admin_can_transfer(): void
    {
        $task = $this->task($this->leaver);

        $this->transfer()->assertRedirect();

        $this->assertSame($this->successor->id, $task->fresh()->assigned_to);
    }

    public function test_an_executive_who_can_read_the_list_cannot_transfer(): void
    {
        Role::findOrCreate('executive')->syncPermissions(['view-users']);
        $executive = User::factory()->create(['is_active' => true]);
        $executive->assignRole('executive');

        $task = $this->task($this->leaver);

        $this->transfer($executive)->assertForbidden();

        $this->assertSame($this->leaver->id, $task->fresh()->assigned_to);
    }

    public function test_an_ordinary_user_cannot_transfer(): void
    {
        $this->transfer(User::factory()->create(['is_active' => true]))->assertForbidden();
    }

    // ---- what moves ----

    public function test_only_unfinished_tasks_move(): void
    {
        $open = $this->task($this->leaver, 'to_do', 'Still open');
        $started = $this->task($this->leaver, 'in_progress', 'Underway');
        $done = $this->task($this->leaver, 'done', 'Finished');
        $cancelled = $this->task($this->leaver, 'cancelled', 'Dropped');

        $this->transfer()->assertRedirect();

        $this->assertSame($this->successor->id, $open->fresh()->assigned_to);
        $this->assertSame($this->successor->id, $started->fresh()->assigned_to);

        // Reassigning these would rewrite who did the work, and every report
        // reads completion history off assigned_to.
        $this->assertSame($this->leaver->id, $done->fresh()->assigned_to);
        $this->assertSame($this->leaver->id, $cancelled->fresh()->assigned_to);
    }

    public function test_other_peoples_tasks_are_untouched(): void
    {
        $theirs = $this->task($this->successor, 'to_do', 'Not involved');
        $bystander = $this->task(User::factory()->create(['is_active' => true]), 'to_do', 'Elsewhere');

        $this->transfer()->assertRedirect();

        $this->assertSame($this->successor->id, $theirs->fresh()->assigned_to);
        $this->assertNotSame($this->successor->id, $bystander->fresh()->assigned_to);
    }

    public function test_a_leaver_with_nothing_open_is_handled(): void
    {
        $this->task($this->leaver, 'done');

        $this->transfer()->assertRedirect();

        $this->assertSame(0, TaskHandover::pendingFor($this->successor)->count());
    }

    // ---- validation ----

    public function test_the_work_cannot_be_transferred_to_the_person_leaving(): void
    {
        $this->actingAs($this->admin)
            ->post("/users/{$this->leaver->id}/transfer-tasks", ['to_user_id' => $this->leaver->id])
            ->assertSessionHasErrors('to_user_id');
    }

    public function test_the_work_cannot_be_transferred_to_a_deactivated_account(): void
    {
        $this->successor->update(['is_active' => false]);
        $task = $this->task($this->leaver);

        $this->transfer()->assertSessionHasErrors('to_user_id');

        $this->assertSame($this->leaver->id, $task->fresh()->assigned_to);
    }

    // ---- task cover ----

    /** @return array{TaskDelegation, Task} */
    private function coverWhere(User $covered, User $delegate, string $from, string $to): array
    {
        $task = $this->task($covered, 'to_do', 'Covered work');

        $delegation = TaskDelegation::create([
            'user_id' => $covered->id,
            'starts_on' => now()->modify($from)->toDateString(),
            'ends_on' => now()->modify($to)->toDateString(),
            'status' => TaskDelegation::SCHEDULED,
        ]);
        $delegation->delegates()->attach($delegate->id, ['position' => 0]);

        TaskDelegationService::activate($delegation->fresh('delegates'));

        return [$delegation, $task];
    }

    public function test_work_the_leaver_was_covering_moves_with_them(): void
    {
        $owner = User::factory()->create(['name' => 'Olive Owner', 'is_active' => true]);
        [, $task] = $this->coverWhere($owner, $this->leaver, '-1 day', '+5 days');

        $this->assertSame($this->leaver->id, $task->fresh()->assigned_to);

        $this->transfer()->assertRedirect();

        $this->assertSame($this->successor->id, $task->fresh()->assigned_to);
    }

    /**
     * The case this feature would otherwise break.
     *
     * Cover hands a task back by checking it is still assigned to the stand-in.
     * If the transfer moves the task but leaves the ledger pointing at the
     * person who left, that check fails and the owner never gets their work
     * back — silently, weeks later.
     */
    public function test_covered_work_still_returns_to_its_owner_after_a_transfer(): void
    {
        $owner = User::factory()->create(['name' => 'Olive Owner', 'is_active' => true]);
        [$delegation, $task] = $this->coverWhere($owner, $this->leaver, '-5 days', '-1 day');

        $this->transfer()->assertRedirect();
        $this->assertSame($this->successor->id, $task->fresh()->assigned_to);

        // The cover period is over; the scheduler ends it.
        TaskDelegationService::processDue();

        $this->assertSame($owner->id, $task->fresh()->assigned_to);
        $this->assertSame(TaskDelegation::ENDED, $delegation->fresh()->status);
    }

    /**
     * The mirror case: somebody was covering for the person who left, so the
     * work is due back to an account that is gone.
     */
    public function test_work_owed_back_to_the_leaver_returns_to_their_successor(): void
    {
        $standIn = User::factory()->create(['name' => 'Stan Standin', 'is_active' => true]);
        [, $task] = $this->coverWhere($this->leaver, $standIn, '-5 days', '-1 day');

        $this->assertSame($standIn->id, $task->fresh()->assigned_to);

        $this->transfer()->assertRedirect();

        TaskDelegationService::processDue();

        // Returning it to the leaver would have parked it with nobody.
        $this->assertSame($this->successor->id, $task->fresh()->assigned_to);
    }

    public function test_a_closed_ledger_entry_is_left_alone(): void
    {
        $owner = User::factory()->create(['is_active' => true]);
        [$delegation, ] = $this->coverWhere($owner, $this->leaver, '-5 days', '-1 day');

        TaskDelegationService::restore($delegation);
        $item = TaskDelegationItem::first();

        $this->transfer()->assertRedirect();

        // History of who held what stays as it happened.
        $this->assertSame($this->leaver->id, (int) $item->fresh()->delegate_id);
    }

    // ---- the record ----

    public function test_the_transfer_is_written_to_the_activity_log(): void
    {
        $this->task($this->leaver);
        $this->task($this->leaver);

        $this->transfer()->assertRedirect();

        $entry = ActivityLog::where('entity_type', 'user')
            ->where('entity_id', $this->leaver->id)
            ->latest('id')
            ->first();

        $this->assertNotNull($entry, 'the transfer left no trace');
        $this->assertSame($this->admin->id, $entry->user_id);
        $this->assertStringContainsString('Sam Successor', $entry->description);
        $this->assertStringContainsString('2', $entry->description);
    }

    public function test_the_users_list_reports_how_much_is_outstanding(): void
    {
        $this->task($this->leaver);
        $this->task($this->leaver);
        $this->task($this->leaver, 'done');

        $this->actingAs($this->admin)
            ->get('/users')
            ->assertOk()
            ->assertInertia(function ($page) {
                $counts = collect($page->toArray()['props']['openTasks'])
                    ->pluck('total', 'user_id');

                // The button has to say how many will move before it moves them.
                $this->assertSame(2, $counts[$this->leaver->id]);
            });
    }
}
