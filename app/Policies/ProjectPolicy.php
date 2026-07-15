<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\User;
use App\Services\FolderService;

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

        // Executives have read access across all projects
        if ($user->hasRole('executive')) {
            return true;
        }

        // Owner or member can view
        if ($project->owner_id === $user->id
            || $project->members()->where('users.id', $user->id)->exists()) {
            return true;
        }

        // Heads/leaders can view projects filed in an org folder they oversee
        if ($project->folder_id
            && FolderService::overseenFolderIds($user)->contains($project->folder_id)) {
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
