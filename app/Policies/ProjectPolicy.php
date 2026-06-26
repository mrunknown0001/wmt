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
        return $user->hasPermissionTo('view-projects');
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
