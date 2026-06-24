<?php

namespace App\Policies;

use App\Models\Division;
use App\Models\User;

class DivisionPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermissionTo('view-divisions');
    }

    public function view(User $user, Division $division): bool
    {
        return $user->hasPermissionTo('view-divisions');
    }

    public function create(User $user): bool
    {
        return $user->hasPermissionTo('manage-divisions');
    }

    public function update(User $user, Division $division): bool
    {
        return $user->hasPermissionTo('manage-divisions');
    }

    public function delete(User $user, Division $division): bool
    {
        return $user->hasPermissionTo('manage-divisions');
    }
}
