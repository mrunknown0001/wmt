<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\FolderService;

/**
 * Who may see which work.
 *
 * Lifted out of SearchController so the tag pages ask exactly the same question
 * rather than a second version of it that drifts. A label is a way in to work,
 * and a way in that answered visibility slightly differently from search would
 * eventually be the way people saw what they should not.
 */
trait ScopesVisibleWork
{
    /**
     * True when the user sees every project, matching ProjectController::index.
     * Admins and executives are unrestricted.
     */
    protected function seesAllProjects(User $user): bool
    {
        return $user->can('manage-projects') || $user->hasRole('executive');
    }

    /**
     * Constrain a Project query to what the user may see — the same clause
     * ProjectController::index applies to the projects list: owned, a member of,
     * holding one of their assigned tasks, or in an org folder they oversee.
     */
    protected function scopeVisibleProjects($query, User $user): void
    {
        if ($this->seesAllProjects($user)) {
            return;
        }

        $overseenFolderIds = FolderService::overseenFolderIds($user);

        $query->where(function ($q) use ($user, $overseenFolderIds) {
            $q->where('owner_id', $user->id)
                ->orWhereHas('members', fn ($m) => $m->where('users.id', $user->id))
                ->orWhereHas('tasks', fn ($t) => $t->where('assigned_to', $user->id))
                ->orWhereIn('folder_id', $overseenFolderIds);
        });
    }

    /**
     * Tasks inherit their project's visibility. Personal tasks (no project) are
     * visible to their creator, assignee, or a collaborator.
     */
    protected function scopeVisibleTasks($query, User $user): void
    {
        if ($this->seesAllProjects($user)) {
            return;
        }

        $query->where(function ($q) use ($user) {
            $q->whereHas('project', fn ($p) => $this->scopeVisibleProjects($p, $user))
                ->orWhere(function ($personal) use ($user) {
                    $personal->whereNull('project_id')
                        ->where(function ($mine) use ($user) {
                            $mine->where('created_by', $user->id)
                                ->orWhere('assigned_to', $user->id)
                                ->orWhereHas('collaborators', fn ($c) => $c->where('users.id', $user->id));
                        });
                });
        });
    }

    /** Minutes are part of their task, and inherit its visibility exactly. */
    protected function scopeVisibleMinutes($query, User $user): void
    {
        if ($this->seesAllProjects($user)) {
            return;
        }

        $query->whereHas('task', fn ($t) => $this->scopeVisibleTasks($t, $user));
    }
}
