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

    /**
     * Whether this person may read a specific task — and, through it, the files
     * attached to it. Distinct from viewAny(), which only asks whether task
     * lists are available to them at all.
     *
     * The old body here returned hasPermissionTo('view-tasks'), which every role
     * holds, so it granted every task to everyone. Nothing called it, so this
     * tightening changes no existing behaviour; AttachmentController is the
     * first caller.
     */
    public function view(User $user, Task $task): bool
    {
        if ($user->hasPermissionTo('manage-tasks')) {
            return true;
        }

        if ($task->isStandalone()) {
            return $task->created_by === $user->id
                || $task->assigned_to === $user->id
                || $task->collaborators()->where('users.id', $user->id)->exists();
        }

        // Reading a task inside a project is the same question as reading the
        // project, so defer rather than restating those rules (owner, member,
        // overseeing head/leader, executive, assignee) and risk drift.
        return $user->can('view', $task->project);
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
