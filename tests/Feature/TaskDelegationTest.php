<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Division;
use App\Models\Project;
use App\Models\Task;
use App\Models\Team;
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
    private User $teamLead;
    private User $deptHead;
    private User $divHead;
    private User $outsider;
    private Project $project;

    /**
     * A single branch of the org chart, plus somebody outside it.
     *
     *   Division "Field"            head: divHead
     *     Department "Support"      head: deptHead
     *       Team "Frontline"        leader: teamLead
     *         owner, standIn, second
     *     Department "Elsewhere"
     *       outsider
     */
    protected function setUp(): void
    {
        parent::setUp();

        Notification::fake();

        $this->teamLead = User::factory()->create(['name' => 'Team Lead', 'is_active' => true]);
        $this->deptHead = User::factory()->create(['name' => 'Dept Head', 'is_active' => true]);
        $this->divHead = User::factory()->create(['name' => 'Div Head', 'is_active' => true]);

        $division = Division::create(['name' => 'Field', 'head_id' => $this->divHead->id]);

        $support = Department::create([
            'name' => 'Support', 'division_id' => $division->id, 'head_id' => $this->deptHead->id,
        ]);
        $elsewhere = Department::create([
            'name' => 'Elsewhere', 'division_id' => $division->id,
        ]);

        $frontline = Team::create([
            'name' => 'Frontline', 'department_id' => $support->id, 'leader_id' => $this->teamLead->id,
        ]);
        $otherTeam = Team::create(['name' => 'Other', 'department_id' => $elsewhere->id]);

        $inTeam = ['is_active' => true, 'department_id' => $support->id, 'team_id' => $frontline->id];

        $this->owner = User::factory()->create(['name' => 'Owner'] + $inTeam);
        $this->standIn = User::factory()->create(['name' => 'Stand In'] + $inTeam);
        $this->second = User::factory()->create(['name' => 'Second'] + $inTeam);

        $this->outsider = User::factory()->create([
            'name' => 'Outsider', 'is_active' => true,
            'department_id' => $elsewhere->id, 'team_id' => $otherTeam->id,
        ]);

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

    // ---- who may arrange cover at all ----

    public function test_an_ordinary_member_cannot_open_the_page(): void
    {
        $this->actingAs($this->owner)->get('/task-delegations')->assertForbidden();
    }

    public function test_an_ordinary_member_cannot_arrange_their_own_cover(): void
    {
        $this->actingAs($this->owner)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertForbidden();
    }

    public function test_a_team_leader_can_arrange_cover_for_their_team(): void
    {
        $task = $this->task();

        $this->actingAs($this->teamLead)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertRedirect();

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
    }

    public function test_a_department_head_reaches_the_teams_inside_their_department(): void
    {
        $task = $this->task();

        $this->actingAs($this->deptHead)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertRedirect();

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
    }

    public function test_a_division_head_reaches_the_whole_branch(): void
    {
        $task = $this->task();

        $this->actingAs($this->divHead)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertRedirect();

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
    }

    public function test_an_administrator_can_arrange_it_for_anybody(): void
    {
        $task = $this->task($this->outsider);

        $this->actingAs($this->makeAdmin())->post('/task-delegations', [
            'user_id' => $this->outsider->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertRedirect();

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
    }

    public function test_an_executive_can_arrange_it_for_anybody(): void
    {
        Role::findOrCreate('executive');
        $executive = User::factory()->create(['is_active' => true]);
        $executive->assignRole('executive');

        $task = $this->task($this->outsider);

        $this->actingAs($executive)->post('/task-delegations', [
            'user_id' => $this->outsider->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertRedirect();

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
    }

    // ---- scope ----

    public function test_a_team_leader_cannot_reach_outside_their_team(): void
    {
        $this->actingAs($this->teamLead)->post('/task-delegations', [
            'user_id' => $this->outsider->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertForbidden();
    }

    public function test_a_team_leader_cannot_push_work_onto_somebody_elses_team(): void
    {
        $this->actingAs($this->teamLead)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->outsider->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertSessionHasErrors('delegate_ids');
    }

    public function test_a_department_head_cannot_reach_a_sibling_department(): void
    {
        // Their department's teams, yes; the department next door, no.
        $this->actingAs($this->deptHead)->post('/task-delegations', [
            'user_id' => $this->outsider->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertForbidden();
    }

    public function test_a_division_head_does_reach_a_second_department_in_their_division(): void
    {
        $task = $this->task($this->outsider);

        $this->actingAs($this->divHead)->post('/task-delegations', [
            'user_id' => $this->outsider->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertRedirect();

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
    }

    public function test_the_picker_offers_only_the_leaders_own_people(): void
    {
        $this->actingAs($this->teamLead)
            ->get('/task-delegations')
            ->assertOk()
            ->assertInertia(function ($page) {
                $names = collect($page->toArray()['props']['people'])->pluck('name')->sort()->values()->all();

                // Their three team members plus themselves — not the outsider.
                $this->assertSame(['Owner', 'Second', 'Stand In', 'Team Lead'], $names);
            });
    }

    public function test_a_leader_may_hand_their_own_work_out(): void
    {
        $task = $this->task($this->teamLead);

        $this->actingAs($this->teamLead)->post('/task-delegations', [
            'user_id' => $this->teamLead->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertRedirect();

        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);
    }

    public function test_a_leader_may_take_the_work_on_themselves(): void
    {
        $task = $this->task();

        $this->actingAs($this->teamLead)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->teamLead->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertRedirect();

        $this->assertSame($this->teamLead->id, $task->fresh()->assigned_to);
    }

    // ---- validation ----

    public function test_you_cannot_stand_in_for_yourself(): void
    {
        $this->actingAs($this->teamLead)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->owner->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertSessionHasErrors('delegate_ids');
    }

    public function test_an_end_date_is_required(): void
    {
        $this->actingAs($this->teamLead)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
        ])->assertSessionHasErrors('ends_on');
    }

    public function test_more_than_two_stand_ins_is_rejected(): void
    {
        $this->actingAs($this->teamLead)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->standIn->id, $this->second->id, $this->teamLead->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertSessionHasErrors('delegate_ids');
    }

    public function test_overlapping_cover_for_the_same_person_is_rejected(): void
    {
        $this->cover([$this->standIn], from: 'now', to: '+10 days');

        $this->actingAs($this->teamLead)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->second->id],
            'starts_on' => now()->addDays(3)->toDateString(),
            'ends_on' => now()->addDays(20)->toDateString(),
        ])->assertSessionHasErrors('starts_on');
    }

    public function test_an_inactive_stand_in_is_rejected_up_front(): void
    {
        $this->standIn->update(['is_active' => false]);

        $this->actingAs($this->teamLead)->post('/task-delegations', [
            'user_id' => $this->owner->id,
            'delegate_ids' => [$this->standIn->id],
            'starts_on' => now()->toDateString(),
            'ends_on' => now()->addDays(5)->toDateString(),
        ])->assertSessionHasErrors('delegate_ids');
    }

    // ---- ending and visibility ----

    public function test_ending_cover_early_returns_the_tasks_now(): void
    {
        $task = $this->task();
        $delegation = $this->cover([$this->standIn]);
        TaskDelegationService::activate($delegation);

        $this->actingAs($this->teamLead)
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

        $this->actingAs($this->teamLead)
            ->delete("/task-delegations/{$delegation->id}")
            ->assertRedirect();

        $this->assertSame($this->owner->id, $task->fresh()->assigned_to);
        $this->assertDatabaseCount('task_delegations', 0);
    }

    public function test_deleting_cover_returns_a_task_that_is_not_yet_due(): void
    {
        // The return is about ownership, not deadlines: a task due next week is
        // just as much the owner's as one due yesterday, and pulling the cover
        // must put it back either way. Pinned because it would be an easy — and
        // wrong — "optimisation" to only bother returning work that is due.
        $task = $this->task();
        $task->update(['due_date' => now()->addWeek()->toDateString()]);

        $delegation = $this->cover([$this->standIn]);
        TaskDelegationService::activate($delegation);
        $this->assertSame($this->standIn->id, $task->fresh()->assigned_to);

        $this->actingAs($this->teamLead)
            ->delete("/task-delegations/{$delegation->id}")
            ->assertRedirect();

        $this->assertSame($this->owner->id, $task->fresh()->assigned_to);
    }

    public function test_ending_cover_early_returns_a_task_that_is_not_yet_due(): void
    {
        $task = $this->task();
        $task->update(['due_date' => now()->addWeek()->toDateString()]);

        $delegation = $this->cover([$this->standIn]);
        TaskDelegationService::activate($delegation);

        $this->actingAs($this->teamLead)
            ->post("/task-delegations/{$delegation->id}/end")
            ->assertRedirect();

        $this->assertSame($this->owner->id, $task->fresh()->assigned_to);
    }

    public function test_a_stand_in_cannot_end_cover_they_did_not_arrange(): void
    {
        $delegation = $this->cover([$this->standIn]);
        TaskDelegationService::activate($delegation);

        $this->actingAs($this->standIn)
            ->post("/task-delegations/{$delegation->id}/end")
            ->assertForbidden();
    }

    public function test_a_leader_cannot_end_cover_outside_their_scope(): void
    {
        $delegation = $this->cover([$this->standIn], for: $this->outsider);
        TaskDelegationService::activate($delegation);

        $this->actingAs($this->teamLead)
            ->post("/task-delegations/{$delegation->id}/end")
            ->assertForbidden();
    }

    public function test_a_stand_in_still_sees_what_they_have_been_signed_up_for(): void
    {
        // The stand-in leads nothing, so they reach the page only because work
        // was handed to them.
        $frontline = Team::where('name', 'Frontline')->first();
        $frontline->update(['leader_id' => $this->standIn->id]);

        $delegation = $this->cover([$this->standIn], for: $this->outsider);
        TaskDelegationService::activate($delegation);

        $this->actingAs($this->standIn)
            ->get('/task-delegations')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('delegations', 1));
    }

    public function test_a_leader_does_not_see_cover_arranged_elsewhere(): void
    {
        // Neither the person covered nor the stand-in is one of theirs.
        TaskDelegationService::activate($this->cover([$this->deptHead], for: $this->outsider));

        $this->actingAs($this->teamLead)
            ->get('/task-delegations')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->has('delegations', 0));
    }
}
