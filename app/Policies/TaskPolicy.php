<?php

namespace App\Policies;

use App\Models\Task;
use App\Models\User;

class TaskPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermissionTo('view-tasks');
    }

    public function view(User $user, Task $task): bool
    {
        return $user->hasPermissionTo('view-tasks');
    }

    public function create(User $user): bool
    {
        return $user->hasPermissionTo('manage-tasks');
    }

    public function update(User $user, Task $task): bool
    {
        return $user->hasPermissionTo('manage-tasks')
            || $task->project->owner_id === $user->id
            || $task->assigned_to === $user->id;
    }

    public function delete(User $user, Task $task): bool
    {
        return $user->hasPermissionTo('manage-tasks')
            || $task->project->owner_id === $user->id;
    }
}
