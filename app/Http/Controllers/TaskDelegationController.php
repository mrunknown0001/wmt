<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\TaskDelegation;
use App\Models\TaskDelegationItem;
use App\Models\User;
use App\Services\OrgScope;
use App\Services\TaskDelegationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Cover for people who are away, for tasks rather than approvals.
 *
 * Arranging cover moves somebody else's work to a third person, so it belongs
 * to whoever is answerable for them: admins and executives across the whole
 * organisation, and division heads, department heads and team leaders over the
 * branch they run. Everyone else has no business here and cannot open the page.
 *
 * Scope is taken from the org chart itself — Division.head_id,
 * Department.head_id, Team.leader_id — not from role names. Holding the
 * "division_head" role while heading no division confers nothing, which is the
 * correct answer: the chart is what says who reports to whom.
 */
class TaskDelegationController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();

        abort_unless(OrgScope::hasAnyScope($user), 403);

        $manages = OrgScope::seesEverything($user);
        $people = OrgScope::manageablePeople($user);

        $query = TaskDelegation::with(['user:id,name', 'delegates:id,name', 'creator:id,name'])
            ->withCount([
                'items as covered_count' => fn ($q) => $q->whereNull('restored_at'),
                'items as returned_count' => fn ($q) => $q->whereNotNull('restored_at'),
            ])
            // This page is whole-person cover; single-task arrangements are
            // managed from the User Overview where they are made.
            ->whereNull('task_id')
            ->orderByDesc('starts_on');

        if (!$manages) {
            // Cover for the people they run, plus anything that hands work to
            // them — a leader signed up as a stand-in for another unit still
            // needs to see what they have been given.
            $query->where(fn ($q) => $q
                ->whereIn('user_id', $people->pluck('id'))
                ->orWhereHas('delegates', fn ($d) => $d->where('users.id', $user->id)));
        }

        return Inertia::render('TaskDelegations/Index', [
            'delegations' => $query->get()->map(fn (TaskDelegation $d) => [
                'id' => $d->id,
                'user' => ['id' => $d->user_id, 'name' => $d->user?->name],
                'delegates' => $d->delegates->map(fn ($u) => ['id' => $u->id, 'name' => $u->name])->values(),
                'starts_on' => $d->starts_on?->toDateString(),
                'ends_on' => $d->ends_on?->toDateString(),
                'period' => $d->periodLabel(),
                'reason' => $d->reason,
                'status' => $d->status,
                'running' => $d->isRunning(),
                'covered_count' => $d->covered_count,
                'returned_count' => $d->returned_count,
                'is_mine' => (int) $d->user_id === (int) $user->id,
                'can_manage' => $this->canManage($request, $d),
            ]),
            // Only their own people — the picker cannot offer somebody they are
            // not answerable for, and store() checks the same list again.
            'people' => $people,
            'currentUserId' => $user->id,
            'maxDelegates' => TaskDelegation::MAX_DELEGATES,
            // Arrived from the Users list with somebody already in mind. Only
            // honoured if they are actually this person's to cover, so a
            // hand-edited id cannot pre-fill a name outside their scope.
            'preselectUserId' => $people->pluck('id')
                ->first(fn ($id) => $id === (int) $request->query('for')),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'user_id' => ['required', 'exists:users,id'],
            'delegate_ids' => ['required', 'array', 'min:1', 'max:' . TaskDelegation::MAX_DELEGATES],
            'delegate_ids.*' => ['required', 'distinct', 'exists:users,id'],
            'starts_on' => ['required', 'date'],
            // Required, unlike approval delegation — cover that never ends
            // would never hand the tasks back, which is the point of this.
            'ends_on' => ['required', 'date', 'after_or_equal:starts_on'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        abort_unless(OrgScope::hasAnyScope($user), 403);

        $scope = OrgScope::manageablePeopleIds($user);
        $delegateIds = collect($data['delegate_ids'])->map(fn ($id) => (int) $id);

        // Both ends have to be theirs. Checking only the person being covered
        // would let a team leader push their team's work onto anyone in the
        // company; checking only the stand-in would let them reach into another
        // unit for the work itself.
        if (!$scope->contains((int) $data['user_id'])) {
            abort(403);
        }

        if ($delegateIds->diff($scope)->isNotEmpty()) {
            throw ValidationException::withMessages([
                'delegate_ids' => 'You can only hand work to people you are responsible for.',
            ]);
        }

        if ($delegateIds->contains((int) $data['user_id'])) {
            throw ValidationException::withMessages([
                'delegate_ids' => 'Somebody cannot stand in for themselves.',
            ]);
        }

        $delegates = User::whereIn('id', $delegateIds)->get();

        if ($delegates->contains(fn (User $u) => !$u->is_active)) {
            throw ValidationException::withMessages([
                'delegate_ids' => 'One of those people is not active and could not pick the work up.',
            ]);
        }

        // Two live arrangements for the same person would fight over the same
        // tasks, and the second hand-back would find them already moved. Only
        // other whole-person cover conflicts — a single-task arrangement leaves
        // the rest of their workload alone, so it does not block this.
        $overlapping = TaskDelegation::where('user_id', $data['user_id'])
            ->whereNull('task_id')
            ->whereIn('status', [TaskDelegation::SCHEDULED, TaskDelegation::ACTIVE])
            ->whereDate('ends_on', '>=', $data['starts_on'])
            ->whereDate('starts_on', '<=', $data['ends_on'])
            ->exists();

        if ($overlapping) {
            throw ValidationException::withMessages([
                'starts_on' => 'This overlaps cover that is already set up for that person.',
            ]);
        }

        $delegation = TaskDelegation::create([
            'user_id' => $data['user_id'],
            'starts_on' => $data['starts_on'],
            'ends_on' => $data['ends_on'],
            'reason' => $data['reason'] ?? null,
            'status' => TaskDelegation::SCHEDULED,
            'created_by' => $user->id,
        ]);

        $delegation->delegates()->attach(
            $delegateIds->mapWithKeys(fn ($id, $i) => [$id => ['position' => $i]])->all()
        );

        // Starting today means starting now: waiting for the overnight run
        // would leave the day it was set up uncovered.
        if ($delegation->covers()) {
            $moved = TaskDelegationService::activate($delegation->fresh('delegates'));

            return back()->with('success', $moved > 0
                ? "Cover started — {$moved} " . str('task')->plural($moved) . ' handed over.'
                : 'Cover started. There were no open tasks to hand over yet.');
        }

        return back()->with('success', 'Cover scheduled. Tasks move over on ' . $delegation->starts_on->format('j M Y') . '.');
    }

    /**
     * Cover a single task rather than a person's whole workload.
     *
     * Arranged from the User Overview, where a manager is looking at one
     * person's task list and wants to move just one item to a stand-in for a
     * spell — a deadline they cannot make, one project they are handing off for
     * a fortnight. Same engine as whole-person cover: the task moves now (or on
     * the start date) and returns on its own the morning after it ends.
     */
    public function storeTask(Request $request): RedirectResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'task_id' => ['required', 'integer', 'exists:tasks,id'],
            'delegate_id' => ['required', 'integer', 'exists:users,id'],
            'starts_on' => ['required', 'date'],
            'ends_on' => ['required', 'date', 'after_or_equal:starts_on'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        abort_unless(OrgScope::hasAnyScope($user), 403);

        $task = Task::findOrFail($data['task_id']);
        $ownerId = (int) $task->assigned_to;
        $delegateId = (int) $data['delegate_id'];

        if (! $ownerId) {
            throw ValidationException::withMessages([
                'task_id' => 'This task is not assigned to anyone, so there is nothing to cover.',
            ]);
        }

        // Reassigning someone's task is arranging their cover — same authority
        // as the whole-person form. Both ends must be within the manager's org
        // scope: the person the task belongs to, and the stand-in taking it.
        abort_unless(OrgScope::manages($user, $ownerId), 403);

        if (! OrgScope::manages($user, $delegateId)) {
            throw ValidationException::withMessages([
                'delegate_id' => 'You can only hand work to people you are responsible for.',
            ]);
        }

        if ($delegateId === $ownerId) {
            throw ValidationException::withMessages([
                'delegate_id' => 'Somebody cannot stand in for themselves.',
            ]);
        }

        $delegate = User::find($delegateId);

        if (! $delegate || ! $delegate->is_active) {
            throw ValidationException::withMessages([
                'delegate_id' => 'That person is not active and could not pick the task up.',
            ]);
        }

        // Already sitting with a stand-in — under its own cover or swept up by a
        // whole-person one. A second arrangement would fight the first over the
        // same task, and the later hand-back would find it already moved.
        $held = TaskDelegationItem::where('task_id', $task->id)
            ->whereNull('restored_at')
            ->exists();

        $overlapping = TaskDelegation::where('task_id', $task->id)
            ->whereIn('status', [TaskDelegation::SCHEDULED, TaskDelegation::ACTIVE])
            ->whereDate('ends_on', '>=', $data['starts_on'])
            ->whereDate('starts_on', '<=', $data['ends_on'])
            ->exists();

        if ($held || $overlapping) {
            throw ValidationException::withMessages([
                'starts_on' => 'This task is already being covered for those dates.',
            ]);
        }

        $delegation = TaskDelegation::create([
            'user_id' => $ownerId,
            'task_id' => $task->id,
            'starts_on' => $data['starts_on'],
            'ends_on' => $data['ends_on'],
            'reason' => $data['reason'] ?? null,
            'status' => TaskDelegation::SCHEDULED,
            'created_by' => $user->id,
        ]);

        $delegation->delegates()->attach($delegateId, ['position' => 0]);

        // Starting today means starting now, so the task does not sit with the
        // wrong person until the overnight run.
        if ($delegation->covers()) {
            $moved = TaskDelegationService::activate($delegation->fresh('delegates'));

            return back()->with('success', $moved > 0
                ? "Task reassigned to {$delegate->name} until " . $delegation->ends_on->format('j M Y') . '.'
                : 'That task could not be handed over — it may have been reassigned or closed already.');
        }

        return back()->with('success', "Task cover scheduled — it moves to {$delegate->name} on " . $delegation->starts_on->format('j M Y') . '.');
    }

    /**
     * End cover early and give the tasks back now.
     *
     * The common case is somebody coming back sooner than planned, so this
     * returns the work rather than deleting the record — the history of who
     * held what is worth keeping.
     */
    public function end(Request $request, TaskDelegation $taskDelegation): RedirectResponse
    {
        abort_unless($this->canManage($request, $taskDelegation), 403);

        if ($taskDelegation->status === TaskDelegation::ENDED) {
            return back()->with('success', 'That cover had already ended.');
        }

        $returned = TaskDelegationService::restore($taskDelegation);

        return back()->with('success', $returned > 0
            ? "Cover ended — {$returned} " . str('task')->plural($returned) . ' returned.'
            : 'Cover ended.');
    }

    /**
     * Drop a delegation entirely.
     *
     * Anything still held is returned first, so deleting the record can never
     * strand a task with a stand-in who is no longer covering.
     */
    public function destroy(Request $request, TaskDelegation $taskDelegation): RedirectResponse
    {
        abort_unless($this->canManage($request, $taskDelegation), 403);

        $returned = $taskDelegation->status === TaskDelegation::ENDED
            ? 0
            : TaskDelegationService::restore($taskDelegation);

        $taskDelegation->delete();

        return back()->with('success', $returned > 0
            ? "Cover removed — {$returned} " . str('task')->plural($returned) . ' returned.'
            : 'Cover removed.');
    }

    /**
     * Ending or removing cover is the same authority as arranging it: whoever
     * is answerable for the person being covered. A stand-in is deliberately
     * not included — being handed work does not give you the right to hand it
     * back early.
     */
    private function canManage(Request $request, TaskDelegation $delegation): bool
    {
        return OrgScope::manages($request->user(), (int) $delegation->user_id);
    }
}
