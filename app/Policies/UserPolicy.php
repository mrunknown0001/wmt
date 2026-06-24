<?php

namespace App\Policies;

use App\Models\User;

class UserPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermissionTo('view-users');
    }

    public function view(User $user, User $model): bool
    {
        return $user->hasPermissionTo('view-users') || $user->id === $model->id;
    }

    public function create(User $user): bool
    {
        return $user->hasPermissionTo('manage-users');
    }

    public function update(User $user, User $model): bool
    {
        return $user->hasPermissionTo('manage-users');
    }

    public function delete(User $user, User $model): bool
    {
        // Prevent self-deletion
        if ($user->id === $model->id) {
            return false;
        }

        return $user->hasPermissionTo('manage-users');
    }
}
