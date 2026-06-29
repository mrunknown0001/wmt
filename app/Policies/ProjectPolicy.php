<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\User;

class ProjectPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->hasPermissionTo('view-projects');
    }

    public function view(User $user, Project $project): bool
    {
        if ($user->hasPermissionTo('manage-projects')) {
            return true;
        }

        // Owner or member can view
        if ($project->owner_id === $user->id
            || $project->members()->where('users.id', $user->id)->exists()) {
            return true;
        }

        // Users with assigned tasks in this project can view
        return $project->tasks()->where('assigned_to', $user->id)->exists();
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function update(User $user, Project $project): bool
    {
        return $user->hasPermissionTo('manage-projects')
            || $project->owner_id === $user->id
            || $project->isProjectAdmin($user);
    }

    public function delete(User $user, Project $project): bool
    {
        return $user->hasPermissionTo('manage-projects')
            || $project->owner_id === $user->id
            || $project->isProjectAdmin($user);
    }
}
