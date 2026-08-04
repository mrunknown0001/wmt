<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskDelegation;
use App\Models\TaskDelegationItem;
use App\Models\User;
use App\Services\TaskDelegationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Temporary cover: someone's tasks move to a stand-in and come back on their
 * own. The hand-over is easy; nearly everything here is about the return trip
 * being exact, because that is where a task quietly ends up with the wrong
 * person weeks later.
 */
class TaskDelegationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private User $standIn;
    private User $second;
    private Project $project;

    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();

        $this->owner = User::factory()->create(['name' => 'Owner', 'is_active' => true]);
        $this->standIn = User::factory()->create(['name' => 'Stand In', 'is_active' => true]);
        $this->second = User::factory()->create(['name' => 'Second', 'is_active' => true]);

        $this->project = Project::create([
            'name' => 'Cover Project',
            'status' => 'active',
            'owner_id' => $this->owner->id,
        ]);
    }

    private function task(?User $assignee = null, string $status = 'to_do', string $title = 'Task'): Task
    {
        return Task::create([
            'project_id' => $this->project->id,
            'title' => $title,
            'status' => $status,
            'priority' => 'medium',
            'assigned_to' => ($assignee ?? $this->owner)->id,
        ]);
    }

    /** @param  array<int, User>  $delegates */
    private function cover(array $delegates, string $from = '-1 day', string $to = '+7 days', ?User $for = null): TaskDelegation
    {
        $delegation = TaskDelegation::create([
            'user_id' => ($for ?? $this->owner)->id,
            'starts_on' => now()->modify($from)->toDateString(),
            'ends_on' => now()->modify($to)->toDateString(),
            'status' => TaskDelegation::SCHEDULED,
        ]);

        foreach (array_values($delegates) as $i => $delegate) {
            $delegation->delegates()->attach($delegate->id, ['position' => $i]);
        }

        return $delegation->fresh('delegates');
    }

    private function makeAdmin(): User
    {
        Permission::findOrCreate('manage-users');
        Role::findOrCreate('admin')->givePermissionTo('manage-users');

        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole('admin');

        return $user;
    }

    // ---- handing over ----

    public function test_open_tasks_move_to_the_stand_in(): void
    {
        $task = $this->task();

        TaskDelegationService::activate($this->cover([$this->standIn]));

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
    }

    public function test_finished_tasks_are_left_where_they_are(): void
    {
        $done = $this->task(status: 'done', title: 'Finished');
        $cancelled = $this->task(status: 'cancelled', title: 'Dropped');

        TaskDelegationService::activate($this->cover([$this->standIn]));

        $this->assertSame($this->owner->id, $done->fresh()->assigned_to);
        $this->assertSame($this->owner->id, $cancelled->fresh()->assigned_to);
    }

    public function test_other_peoples_tasks_are_untouched(): void
    {
        $theirs = $this->task($this->second, title: 'Not involved');

        TaskDelegationService::activate($this->cover([$this->standIn]));

        $this->assertSame($this->second->id, $theirs->fresh()->assigned_to);
    }

    public function test_two_stand_ins_split_the_tasks_evenly(): void
    {
        $tasks = collect(range(1, 6))->map(fn ($i) => $this->task(title: "Task {$i}"));

        TaskDelegationService::activate($this->cover([$this->standIn, $this->second]));

        $byDelegate = $tasks->map(fn (Task $t) => $t->fresh()->assigned_to)->countBy();

        $this->assertSame(3, $byDelegate[$this->standIn->id]);
        $this->assertSame(3, $byDelegate[$this->second->id]);
    }

    public function test_an_odd_number_splits_as_evenly_as_it_can(): void
    {
        $tasks = collect(range(1, 5))->map(fn ($i) => $this->task(title: "Task {$i}"));

        TaskDelegationService::activate($this->cover([$this->standIn, $this->second]));

        $byDelegate = $tasks->map(fn (Task $t) => $t->fresh()->assigned_to)->countBy();

        $this->assertSame(3, $byDelegate[$this->standIn->id]);
        $this->assertSame(2, $byDelegate[$this->second->id]);
    }

    public function test_an_inactive_stand_in_is_skipped(): void
    {
        $this->second->update(['is_active' => false]);
        $tasks = collect(range(1, 4))->map(fn ($i) => $this->task(title: "Task {$i}"));

        TaskDelegationService::activate($this->cover([$this->standIn, $this->second]));

        foreach ($tasks as $task) {
            $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
        }
    }

    public function test_the_stand_in_is_told(): void
    {
        $this->task();

        TaskDelegationService::activate($this->cover([$this->standIn]));

        Notification::assertSentTo($this->standIn, \App\Notifications\TaskDelegationNotification::class);
    }

    // ---- work arriving mid-cover ----

    public function test_a_task_assigned_during_cover_goes_to_the_stand_in(): void
    {
        TaskDelegationService::activate($this->cover([$this->standIn]));

        $later = $this->task(title: 'Raised while away');

        $this->assertSame($this->standIn->id, $later->fresh()->assigned_to);
    }

    public function test_a_task_reassigned_to_an_absent_person_goes_to_the_stand_in(): void
    {
        $task = $this->task($this->second, title: 'Moved onto someone away');
        TaskDelegationService::activate($this->cover([$this->standIn]));

        $task->update(['assigned_to' => $this->owner->id]);

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
    }

    public function test_later_tasks_continue_the_rotation_rather_than_restarting_it(): void
    {
        $first = $this->task(title: 'One');
        TaskDelegationService::activate($this->cover([$this->standIn, $this->second]));

        $this->assertSame($this->standIn->id, $first->fresh()->assigned_to);

        // Dealt after one task has already gone out, so it is the second
        // stand-in's turn — not the first one's again.
        $next = $this->task(title: 'Two');

        $this->assertSame($this->second->id, $next->fresh()->assigned_to);
    }

    public function test_cover_does_not_chain(): void
    {
        $task = $this->task();
        TaskDelegationService::activate($this->cover([$this->standIn]));
        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);

        // Now the stand-in goes away too, covered by a third person.
        TaskDelegationService::activate(
            $this->cover([$this->second], for: $this->standIn)
        );

        // The owner's task stays with the person covering for the owner.
        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
    }

    public function test_editing_a_covered_task_does_not_re_deal_it(): void
    {
        $task = $this->task();
        TaskDelegationService::activate($this->cover([$this->standIn, $this->second]));

        $task->fresh()->update(['title' => 'Renamed while covered']);

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
        $this->assertSame(1, TaskDelegationItem::where('task_id', $task->id)->count());
    }

    // ---- the return trip ----

    public function test_tasks_come_back_when_the_period_ends(): void
    {
        $task = $this->task();
        $delegation = $this->cover([$this->standIn], from: '-5 days', to: '-1 day');

        // Backdated cover: switch it on as if it had started, then let the
        // scheduler notice it is over.
        $delegation->update(['starts_on' => now()->subDays(5)->toDateString()]);
        TaskDelegationService::activate($delegation);
        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);

        $summary = TaskDelegationService::processDue();

        $this->assertSame($this->owner->id, $task->fresh()->assigned_to);
        $this->assertSame(1, $summary['ended']);
        $this->assertSame(1, $summary['tasks_back']);
        $this->assertSame(TaskDelegation::ENDED, $delegation->fresh()->status);
    }

    public function test_the_owner_is_told_their_tasks_are_back(): void
    {
        $this->task();
        $delegation = $this->cover([$this->standIn], from: '-5 days', to: '-1 day');
        TaskDelegationService::activate($delegation);

        TaskDelegationService::processDue();

        Notification::assertSentTo($this->owner, \App\Notifications\TaskDelegationNotification::class);
    }

    public function test_cover_still_running_returns_nothing(): void
    {
        $task = $this->task();
        TaskDelegationService::activate($this->cover([$this->standIn]));

        TaskDelegationService::processDue();

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
    }

    public function test_a_task_moved_on_by_hand_is_not_dragged_back(): void
    {
        $task = $this->task();
        $delegation = $this->cover([$this->standIn], from: '-5 days', to: '-1 day');
        TaskDelegationService::activate($delegation);

        // Somebody decides it really belongs to a third person.
        $task->fresh()->update(['assigned_to' => $this->second->id]);

        TaskDelegationService::processDue();

        $this->assertSame($this->second->id, $task->fresh()->assigned_to);
    }

    public function test_a_task_the_stand_in_finished_stays_with_them(): void
    {
        $task = $this->task();
        $delegation = $this->cover([$this->standIn], from: '-5 days', to: '-1 day');
        TaskDelegationService::activate($delegation);

        $task->fresh()->update(['status' => 'done']);

        TaskDelegationService::processDue();

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
    }

    public function test_every_item_is_closed_out_even_when_the_task_is_not_moved(): void
    {
        $task = $this->task();
        $delegation = $this->cover([$this->standIn], from: '-5 days', to: '-1 day');
        TaskDelegationService::activate($delegation);
        $task->fresh()->update(['assigned_to' => $this->second->id]);

        TaskDelegationService::processDue();

        // Left open, a stale item would try to reclaim the task at the next run.
        $this->assertSame(0, $delegation->items()->whereNull('restored_at')->count());
    }

    public function test_a_task_deleted_during_cover_does_not_break_the_return(): void
    {
        $kept = $this->task(title: 'Kept');
        $gone = $this->task(title: 'Deleted');
        $delegation = $this->cover([$this->standIn], from: '-5 days', to: '-1 day');
        TaskDelegationService::activate($delegation);

        $gone->delete();

        TaskDelegationService::processDue();

        $this->assertSame($this->owner->id, $kept->fresh()->assigned_to);
    }

    // ---- scheduling ----

    public function test_cover_that_has_not_started_moves_nothing(): void
    {
        $task = $this->task();
        $this->cover([$this->standIn], from: '+3 days', to: '+10 days');

        TaskDelegationService::processDue();

        $this->assertSame($this->owner->id, $task->fresh()->assigned_to);
    }

    public function test_cover_starts_on_its_first_day(): void
    {
        $task = $this->task();
        $this->cover([$this->standIn], from: 'now', to: '+10 days');

        $summary = TaskDelegationService::processDue();

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
        $this->assertSame(1, $summary['started']);
    }

    public function test_back_to_back_cover_hands_back_before_it_hands_on(): void
    {
        $task = $this->task();

        $first = $this->cover([$this->standIn], from: '-5 days', to: '-1 day');
        TaskDelegationService::activate($first);
        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);

        // A second arrangement starting today, with a different stand-in.
        $this->cover([$this->second], from: 'now', to: '+5 days');

        TaskDelegationService::processDue();

        // Handed back to the owner first, then out to the new stand-in — not
        // inherited straight from the previous one.
        $this->assertSame($this->second->id, $task->fresh()->assigned_to);

        $item = TaskDelegationItem::where('task_id', $task->id)
            ->whereNull('restored_at')->first();
        $this->assertSame($this->owner->id, (int) $item->original_assignee_id);
    }

    public function test_cover_whose_window_passed_before_it_ran_is_closed_without_moving_anything(): void
    {
        $task = $this->task();
        $this->cover([$this->standIn], from: '-10 days', to: '-3 days');

        TaskDelegationService::processDue();

        $this->assertSame($this->owner->id, $task->fresh()->assigned_to);
        $this->assertSame(TaskDelegation::ENDED, TaskDelegation::first()->status);
    }

    public function test_activating_twice_does_not_hand_the_same_task_over_twice(): void
    {
        $task = $this->task();
        $delegation = $this->cover([$this->standIn]);

        TaskDelegationService::activate($delegation);
        TaskDelegationService::activate($delegation->fresh('delegates'));

        $this->assertSame(1, TaskDelegationItem::where('task_id', $task->id)->count());
        $this->assertSame($this->owner->id, (int) TaskDelegationItem::first()->original_assignee_id);
    }

    // ---- the HTTP surface ----

    public function test_setting_up_cover_starting_today_hands_over_immediately(): void
    {
        $task = $this->task();

        $this->actingAs($this->owner)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertRedirect();

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
    }

    public function test_you_cannot_set_up_cover_for_somebody_else(): void
    {
        $this->actingAs($this->owner)->post('/task-delegations', [
            'user_id' => $this->second->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertForbidden();
    }

    public function test_an_administrator_can_set_it_up_for_anybody(): void
    {
        $task = $this->task();

        $this->actingAs($this->makeAdmin())->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertRedirect();

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
    }

    public function test_you_cannot_stand_in_for_yourself(): void
    {
        $this->actingAs($this->owner)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->owner->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertSessionHasErrors('delegate_ids');
    }

    public function test_an_end_date_is_required(): void
    {
        $this->actingAs($this->owner)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
        ])->assertSessionHasErrors('ends_on');
    }

    public function test_more_than_two_stand_ins_is_rejected(): void
    {
        $third = User::factory()->create(['is_active' => true]);

        $this->actingAs($this->owner)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->standIn->id, $this->second->id, $third->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertSessionHasErrors('delegate_ids');
    }

    public function test_overlapping_cover_for_the_same_person_is_rejected(): void
    {
        $this->cover([$this->standIn], from: 'now', to: '+10 days');

        $this->actingAs($this->owner)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->second->id],
            'starts_on' => now()->addDays(3)->toDateString(),
            'ends_on' => now()->addDays(20)->toDateString(),
        ])->assertSessionHasErrors('starts_on');
    }

    public function test_an_inactive_stand_in_is_rejected_up_front(): void
    {
        $this->standIn->update(['is_active' => false]);

        $this->actingAs($this->owner)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertSessionHasErrors('delegate_ids');
    }

    public function test_ending_cover_early_returns_the_tasks_now(): void
    {
        $task = $this->task();
        $delegation = $this->cover([$this->standIn]);
        TaskDelegationService::activate($delegation);

        $this->actingAs($this->owner)
            ->post("/task-delegations/{$delegation->id}/end")
            ->assertRedirect();

        $this->assertSame($this->owner->id, $task->fresh()->assigned_to);
        $this->assertSame(TaskDelegation::ENDED, $delegation->fresh()->status);
    }

    public function test_deleting_cover_returns_the_tasks_first(): void
    {
        $task = $this->task();
        $delegation = $this->cover([$this->standIn]);
        TaskDelegationService::activate($delegation);

        $this->actingAs($this->owner)
            ->delete("/task-delegations/{$delegation->id}")
            ->assertRedirect();

        $this->assertSame($this->owner->id, $task->fresh()->assigned_to);
        $this->assertDatabaseCount('task_delegations', 0);
    }

    public function test_a_stand_in_cannot_end_cover_they_did_not_arrange(): void
    {
        $delegation = $this->cover([$this->standIn]);
        TaskDelegationService::activate($delegation);

        $this->actingAs($this->standIn)
            ->post("/task-delegations/{$delegation->id}/end")
            ->assertForbidden();
    }

    public function test_the_stand_in_can_see_what_they_have_been_signed_up_for(): void
    {
        $delegation = $this->cover([$this->standIn]);
        TaskDelegationService::activate($delegation);

        $this->actingAs($this->standIn)
            ->get('/task-delegations')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('delegations', 1));
    }

    public function test_unrelated_people_do_not_see_it(): void
    {
        TaskDelegationService::activate($this->cover([$this->standIn]));

        $this->actingAs($this->second)
            ->get('/task-delegations')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('delegations', 0));
    }
}
