<?php

namespace App\Policies;

use App\Models\ApprovalItem;
use App\Models\User;

class ApprovalItemPolicy
{
    public function view(User $user, ApprovalItem $item): bool
    {
        // Project members, owner, requester, or eligible current approver
        if ($item->approvalProject->members()->where('user_id', $user->id)->exists()) {
            return true;
        }
        if ($item->approvalProject->owner_id === $user->id) {
            return true;
        }
        if ($item->requested_by === $user->id) {
            return true;
        }
        // Check if user is an eligible approver in the current active step
        $activeInstance = $item->stepInstances()->where('status', 'active')->first();
        if ($activeInstance && $activeInstance->approvers()->where('user_id', $user->id)->exists()) {
            return true;
        }
        // Also allow viewing if user has already made a decision on this item (in any step instance)
        $hasDecided = $item->stepInstances()
            ->whereHas('decisions', function ($q) use ($user) {
                $q->where('decided_by', $user->id);
            })
            ->exists();
        if ($hasDecided) {
            return true;
        }
        return false;
    }

    public function create(User $user, ApprovalItem $item = null): bool
    {
        // Members of the approval project can create items
        return true;
    }

    public function update(User $user, ApprovalItem $item): bool
    {
        // Only requester (while pending) or project admin/owner
        if ($item->status === 'pending' && $item->requested_by === $user->id) {
            return true;
        }
        if ($item->approvalProject->owner_id === $user->id) {
            return true;
        }
        if ($item->approvalProject->isProjectAdmin($user)) {
            return true;
        }
        return false;
    }

    public function cancel(User $user, ApprovalItem $item): bool
    {
        // Requester (while pending) or project admin/owner
        if ($item->status === 'pending' && $item->requested_by === $user->id) {
            return true;
        }
        if ($item->approvalProject->owner_id === $user->id) {
            return true;
        }
        if ($item->approvalProject->isProjectAdmin($user)) {
            return true;
        }
        return false;
    }

    public function decide(User $user, ApprovalItem $item): bool
    {
        // User must have the approver capability enabled...
        if (!$user->can_approve) {
            return false;
        }
        // ...and be an eligible approver in an active step.
        $activeInstance = $item->stepInstances()->where('status', 'active')->first();
        if (!$activeInstance) {
            return false;
        }
        return $activeInstance->approvers()->where('user_id', $user->id)->exists();
    }

    public function resubmit(User $user, ApprovalItem $item): bool
    {
        // Only requester can resubmit
        return $item->requested_by === $user->id && $item->status === 'changes_requested';
    }
}
