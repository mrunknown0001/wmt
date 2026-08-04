<?php

namespace App\Services;

use App\Models\ApprovalDelegation;
use App\Models\ApprovalStepInstance;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Standing in for approvers who are away.
 *
 * A delegation is deliberately additive: the delegate joins the approver list,
 * the original stays on it. Either can decide. Removing the original would mean
 * an approval nobody could give if the delegation were set up wrongly, and
 * would strip authority the chain deliberately assigned.
 *
 * Delegation is not transitive. If A delegates to B and B delegates to C, C
 * does not inherit A's approvals — chains of stand-ins are how authority ends
 * up somewhere nobody intended.
 */
class ApprovalDelegationService
{
    /**
     * Delegations in force today for the given approvers.
     *
     * @param  Collection<int, int>|array<int, int>  $userIds
     * @return Collection<int, ApprovalDelegation>
     */
    public static function activeFor($userIds): Collection
    {
        $ids = collect($userIds)->filter()->unique()->values();

        if ($ids->isEmpty()) {
            return collect();
        }

        return ApprovalDelegation::query()
            ->whereIn('user_id', $ids)
            ->activeOn()
            // An inactive stand-in cannot act, so the delegation is dead.
            ->whereHas('delegate', fn ($q) => $q->where('is_active', true))
            ->with('delegate')
            ->get();
    }

    /**
     * Add stand-ins to a step instance's approver list.
     *
     * Safe to call more than once: rows already present are skipped, so a
     * delegation created while a step is live can be applied without
     * duplicating anyone.
     *
     * @return int how many stand-ins were added
     */
    public static function applyTo(ApprovalStepInstance $instance): int
    {
        $existing = $instance->approvers()->pluck('user_id')->map(fn ($id) => (int) $id);

        // Only the people the chain actually chose can delegate here — not
        // stand-ins already added, which is what keeps this non-transitive.
        $originals = $instance->approvers()
            ->whereNull('delegated_from_user_id')
            ->pluck('user_id');

        $added = 0;

        foreach (self::activeFor($originals) as $delegation) {
            $delegateId = (int) $delegation->delegate_id;

            // Already an approver in their own right, or already stood in.
            if ($existing->contains($delegateId)) {
                continue;
            }

            $instance->approvers()->create([
                'user_id' => $delegateId,
                'delegated_from_user_id' => $delegation->user_id,
            ]);

            $existing->push($delegateId);
            $added++;
        }

        return $added;
    }

    /**
     * Apply a newly created delegation to work already waiting.
     *
     * Without this, setting an out-of-office on the morning you leave would
     * cover nothing you were already holding — which is precisely the queue
     * that needs covering.
     *
     * @return int how many live steps the stand-in was added to
     */
    public static function backfill(ApprovalDelegation $delegation): int
    {
        // Not running yet, or the stand-in is no longer an active account —
        // adding someone who cannot sign in just hides the fact that nobody is
        // covering. activeFor() applies the same two tests.
        if (!$delegation->isActive() || !$delegation->delegate?->is_active) {
            return 0;
        }

        $instances = ApprovalStepInstance::query()
            ->where('status', 'active')
            ->whereHas('approvers', fn ($q) => $q
                ->where('user_id', $delegation->user_id)
                ->whereNull('delegated_from_user_id'))
            ->get();

        $touched = 0;

        foreach ($instances as $instance) {
            if ($instance->approvers()->where('user_id', $delegation->delegate_id)->exists()) {
                continue;
            }

            $instance->approvers()->create([
                'user_id' => $delegation->delegate_id,
                'delegated_from_user_id' => $delegation->user_id,
            ]);

            $touched++;
        }

        return $touched;
    }

    /**
     * Remove stand-in rows created by a delegation that is ending.
     *
     * Only rows nobody has acted on: if the delegate already decided, the
     * decision stands and the row that justified it must stay.
     */
    public static function withdraw(ApprovalDelegation $delegation): int
    {
        $instances = ApprovalStepInstance::query()
            ->where('status', 'active')
            ->whereHas('approvers', fn ($q) => $q
                ->where('user_id', $delegation->delegate_id)
                ->where('delegated_from_user_id', $delegation->user_id))
            ->get();

        $removed = 0;

        foreach ($instances as $instance) {
            $hasDecided = $instance->decisions()
                ->where('decided_by', $delegation->delegate_id)
                ->exists();

            if ($hasDecided) {
                continue;
            }

            $removed += $instance->approvers()
                ->where('user_id', $delegation->delegate_id)
                ->where('delegated_from_user_id', $delegation->user_id)
                ->delete();
        }

        return $removed;
    }

    /** Who this person is currently standing in for. */
    public static function standingInFor(User $user): Collection
    {
        return ApprovalDelegation::where('delegate_id', $user->id)
            ->activeOn()
            ->with('user:id,name')
            ->get();
    }
}
