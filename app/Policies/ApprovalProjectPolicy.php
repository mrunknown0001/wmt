<?php

namespace App\Policies;

use App\Models\ApprovalProject;
use App\Models\User;

class ApprovalProjectPolicy
{
    public function viewAny(User $user): bool
    {
        // Admins/executives always have access. Ordinary users need the approver
        // capability plus the view permission. (can() instead of hasPermissionTo()
        // so a missing permission returns false rather than throwing.)
        if ($user->hasRole('admin') || $user->hasRole('executive')) {
            return true;
        }
        return $user->can_approve && $user->can('view-approval-projects');
    }

    public function view(User $user, ApprovalProject $project): bool
    {
        // Admins/executives always have access.
        if ($user->hasRole('admin') || $user->hasRole('executive')) {
            return true;
        }
        if (!$user->can_approve) {
            return false;
        }
        if ($user->can('manage-approval-projects')) {
            return true;
        }
        if ($project->owner_id === $user->id) {
            return true;
        }
        return $project->members()->where('user_id', $user->id)->exists();
    }

    public function create(User $user): bool
    {
        return true;
    }

    // can() rather than hasPermissionTo() throughout, for the reason given on
    // viewAny above: hasPermissionTo() throws when the permission row itself is
    // missing, so an unseeded install turns a plain "no" into a 500. That now
    // matters more than it did — ApprovalItemPolicy defers to update() below for
    // its own update and cancel decisions.

    public function update(User $user, ApprovalProject $project): bool
    {
        return $user->can('manage-approval-projects')
            || $project->owner_id === $user->id
            || $project->isProjectAdmin($user);
    }

    public function delete(User $user, ApprovalProject $project): bool
    {
        return $user->can('manage-approval-projects')
            || $project->owner_id === $user->id
            || $project->isProjectAdmin($user);
    }

    /** Restoring from Trash is the same authority as deleting. */
    public function restore(User $user, ApprovalProject $project): bool
    {
        return $this->delete($user, $project);
    }

    /** Permanent deletion (project + all its items) — same authority as delete. */
    public function forceDelete(User $user, ApprovalProject $project): bool
    {
        return $this->delete($user, $project);
    }
}
