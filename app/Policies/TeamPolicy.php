<?php

namespace App\Policies;

use App\Models\Team;
use App\Models\User;

class TeamPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermissionTo('view-teams');
    }

    public function view(User $user, Team $team): bool
    {
        return $user->hasPermissionTo('view-teams');
    }

    public function create(User $user): bool
    {
        return $user->hasPermissionTo('manage-teams');
    }

    public function update(User $user, Team $team): bool
    {
        return $user->hasPermissionTo('manage-teams');
    }

    public function delete(User $user, Team $team): bool
    {
        return $user->hasPermissionTo('manage-teams');
    }
}
