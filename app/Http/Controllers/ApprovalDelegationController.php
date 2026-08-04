<?php

namespace App\Http\Controllers;

use App\Models\ApprovalDelegation;
use App\Models\User;
use App\Services\ApprovalDelegationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Cover for approvers who are away.
 *
 * Anyone can arrange their own; someone who manages users can arrange it for
 * others, which is what you need when a person is already off sick and has a
 * queue building up.
 */
class ApprovalDelegationController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        $manages = $user->can('manage-users');

        $query = ApprovalDelegation::with(['user:id,name', 'delegate:id,name', 'creator:id,name'])
            ->orderByDesc('starts_on');

        if (!$manages) {
            // Your own, plus the ones naming you as the stand-in — you should
            // be able to see what you have been signed up for.
            $query->where(fn ($q) => $q->where('user_id', $user->id)->orWhere('delegate_id', $user->id));
        }

        return Inertia::render('ApprovalDelegations/Index', [
            'delegations' => $query->get()->map(fn (ApprovalDelegation $d) => [
                'id' => $d->id,
                'user' => ['id' => $d->user_id, 'name' => $d->user?->name],
                'delegate' => ['id' => $d->delegate_id, 'name' => $d->delegate?->name],
                'starts_on' => $d->starts_on?->toDateString(),
                'ends_on' => $d->ends_on?->toDateString(),
                'period' => $d->periodLabel(),
                'reason' => $d->reason,
                'active' => $d->isActive(),
                'is_mine' => (int) $d->user_id === (int) $user->id,
                'can_manage' => $this->canManage($request, $d),
            ]),
            'people' => User::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'canManageOthers' => $manages,
            'currentUserId' => $user->id,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'user_id' => ['required', 'exists:users,id'],
            'delegate_id' => ['required', 'exists:users,id', 'different:user_id'],
            'starts_on' => ['required', 'date'],
            'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        // Only for yourself, unless you administer people.
        if ((int) $data['user_id'] !== (int) $user->id && !$user->can('manage-users')) {
            abort(403);
        }

        $delegate = User::find($data['delegate_id']);

        if (!$delegate?->is_active) {
            throw ValidationException::withMessages([
                'delegate_id' => 'That person is not active and could not act on approvals.',
            ]);
        }

        // A second live delegation for the same person makes it ambiguous who
        // is covering, and both stand-ins would be added to every step.
        $overlapping = ApprovalDelegation::where('user_id', $data['user_id'])
            ->where(function ($q) use ($data) {
                $q->whereNull('ends_on')->orWhereDate('ends_on', '>=', $data['starts_on']);
            })
            ->when($data['ends_on'] ?? null, fn ($q, $ends) => $q->whereDate('starts_on', '<=', $ends))
            ->exists();

        if ($overlapping) {
            throw ValidationException::withMessages([
                'starts_on' => 'This overlaps a delegation that is already set up for that person.',
            ]);
        }

        $delegation = ApprovalDelegation::create($data + ['created_by' => $user->id]);

        // Cover the queue that is already waiting, not just what arrives next.
        $backfilled = ApprovalDelegationService::backfill($delegation);

        return back()->with('success', $backfilled > 0
            ? "Delegation added — {$backfilled} pending " . str('approval')->plural($backfilled) . ' now also visible to the stand-in.'
            : 'Delegation added.');
    }

    public function destroy(Request $request, ApprovalDelegation $approvalDelegation): RedirectResponse
    {
        abort_unless($this->canManage($request, $approvalDelegation), 403);

        // Take the stand-in back off anything they have not acted on. A
        // decision they already made stays, along with the row explaining it.
        $removed = ApprovalDelegationService::withdraw($approvalDelegation);

        $approvalDelegation->delete();

        return back()->with('success', $removed > 0
            ? "Delegation removed from {$removed} pending " . str('approval')->plural($removed) . '.'
            : 'Delegation removed.');
    }

    private function canManage(Request $request, ApprovalDelegation $delegation): bool
    {
        return (int) $delegation->user_id === (int) $request->user()->id
            || $request->user()->can('manage-users');
    }
}
