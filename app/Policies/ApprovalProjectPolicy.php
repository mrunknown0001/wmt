<?php

namespace App\Policies;

use App\Models\ApprovalProject;
use App\Models\User;

class ApprovalProjectPolicy
{
    public function viewAny(User $user): bool
    {
        // The Approvals area is only available to users granted the approver capability.
        return $user->can_approve && $user->hasPermissionTo('view-approval-projects');
    }

    public function view(User $user, ApprovalProject $project): bool
    {
        if (!$user->can_approve) {
            return false;
        }
        if ($user->hasPermissionTo('manage-approval-projects')) {
            return true;
        }
        if ($user->hasRole('executive')) {
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

    public function update(User $user, ApprovalProject $project): bool
    {
        return $user->hasPermissionTo('manage-approval-projects')
            || $project->owner_id === $user->id
            || $project->isProjectAdmin($user);
    }

    public function delete(User $user, ApprovalProject $project): bool
    {
        return $user->hasPermissionTo('manage-approval-projects')
            || $project->owner_id === $user->id
            || $project->isProjectAdmin($user);
    }
}
