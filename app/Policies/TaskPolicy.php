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
        return true;
    }

    public function update(User $user, Task $task): bool
    {
        if ($user->hasPermissionTo('manage-tasks')) {
            return true;
        }

        if ($task->isStandalone()) {
            return $task->created_by === $user->id
                || $task->assigned_to === $user->id;
        }

        // Editors and admins can change any task in the project; everyone else
        // only the ones assigned to them.
        return $task->project->userCanManageTasks($user)
            || $task->assigned_to === $user->id;
    }

    public function delete(User $user, Task $task): bool
    {
        if ($user->hasPermissionTo('manage-tasks')) {
            return true;
        }

        if ($task->isStandalone()) {
            return $task->created_by === $user->id;
        }

        // Deleting is task management, so editors qualify — but being merely
        // assigned to a task does not let you delete it.
        return $task->project->userCanManageTasks($user);
    }
}
