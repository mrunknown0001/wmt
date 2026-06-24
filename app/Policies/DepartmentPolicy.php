<?php

namespace App\Policies;

use App\Models\Department;
use App\Models\User;

class DepartmentPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermissionTo('view-departments');
    }

    public function view(User $user, Department $department): bool
    {
        return $user->hasPermissionTo('view-departments');
    }

    public function create(User $user): bool
    {
        return $user->hasPermissionTo('manage-departments');
    }

    public function update(User $user, Department $department): bool
    {
        return $user->hasPermissionTo('manage-departments');
    }

    public function delete(User $user, Department $department): bool
    {
        return $user->hasPermissionTo('manage-departments');
    }
}
