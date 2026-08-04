<?php

namespace App\Http\Controllers;

use App\Models\TaskDelegation;
use App\Models\User;
use App\Services\TaskDelegationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Cover for people who are away, for tasks rather than approvals.
 *
 * Same access rule as approval delegation: your own by default, anyone's if you
 * administer users. Someone already off sick cannot set their own up, which is
 * exactly when an administrator needs to do it for them.
 */
class TaskDelegationController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $manages = $user->can('manage-users');

        $query = TaskDelegation::with(['user:id,name', 'delegates:id,name', 'creator:id,name'])
            ->withCount([
                'items as covered_count' => fn ($q) => $q->whereNull('restored_at'),
                'items as returned_count' => fn ($q) => $q->whereNotNull('restored_at'),
            ])
            ->orderByDesc('starts_on');

        if (!$manages) {
            // Your own, plus the ones that hand work to you.
            $query->where(fn ($q) => $q
                ->where('user_id', $user->id)
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
            'people' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'canManageOthers' => $manages,
            'currentUserId' => $user->id,
            'maxDelegates' => TaskDelegation::MAX_DELEGATES,
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

        if ((int) $data['user_id'] !== (int) $user->id && !$user->can('manage-users')) {
            abort(403);
        }

        $delegateIds = collect($data['delegate_ids'])->map(fn ($id) => (int) $id);

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
        // tasks, and the second hand-back would find them already moved.
        $overlapping = TaskDelegation::where('user_id', $data['user_id'])
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

    private function canManage(Request $request, TaskDelegation $delegation): bool
    {
        return (int) $delegation->user_id === (int) $request->user()->id
            || $request->user()->can('manage-users');
    }
}
