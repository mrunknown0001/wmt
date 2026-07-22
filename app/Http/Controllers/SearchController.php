<?php

namespace App\Http\Controllers;

use App\Models\ApprovalItem;
use App\Models\ApprovalProject;
use App\Models\Folder;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\FolderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    /** Sections always present in the payload, so the client can rely on the shape. */
    private const EMPTY_RESULTS = [
        'projects' => [],
        'folders' => [],
        'tasks' => [],
        'approvalProjects' => [],
        'approvalItems' => [],
        'users' => [],
    ];

    public function __invoke(Request $request): JsonResponse
    {
        $q = $request->input('q', '');

        if (strlen($q) < 2) {
            return response()->json(self::EMPTY_RESULTS);
        }

        $user = $request->user();
        $like = '%' . $q . '%';

        return response()->json([
            'projects' => $this->projects($user, $like),
            'folders' => $this->folders($user, $like),
            'tasks' => $this->tasks($user, $like),
            'approvalProjects' => $this->approvalProjects($user, $like),
            'approvalItems' => $this->approvalItems($user, $like),
            'users' => $this->users($user, $like),
        ]);
    }

    /**
     * True when the user sees every project, matching ProjectController::index.
     * Admins and executives are unrestricted.
     */
    private function seesAllProjects(User $user): bool
    {
        return $user->can('manage-projects') || $user->hasRole('executive');
    }

    /**
     * Constrain a Project query to what the user may see — the same clause
     * ProjectController::index applies to the projects list: owned, a member of,
     * holding one of their assigned tasks, or in an org folder they oversee.
     */
    private function scopeVisibleProjects($query, User $user): void
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

    private function projects(User $user, string $like)
    {
        $query = Project::where('name', 'like', $like);
        $this->scopeVisibleProjects($query, $user);

        return $query->with('owner:id,name')
            ->select('id', 'name', 'status', 'owner_id')
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get()
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'status' => $p->status,
                'owner' => $p->owner?->name,
                'url' => "/projects/{$p->id}",
            ]);
    }

    /** Only folders the user can actually see, per the same rules as the folder tree. */
    private function folders(User $user, string $like)
    {
        $visibleIds = FolderService::visibleFolderIds($user);

        if ($visibleIds->isEmpty()) {
            return collect();
        }

        return Folder::whereIn('id', $visibleIds)
            ->where('name', 'like', $like)
            ->select('id', 'name', 'parent_id', 'path')
            ->withCount('projects') // must follow select(), which would otherwise drop the count column
            ->orderBy('name')
            ->take(5)
            ->get()
            ->map(fn ($f) => [
                'id' => $f->id,
                'name' => $f->name,
                'project_count' => $f->projects_count,
                'url' => "/projects?view=folders&folder={$f->id}",
            ]);
    }

    /**
     * Tasks inherit their project's visibility. Personal tasks (no project) are
     * visible to their creator, assignee, or a collaborator.
     */
    private function tasks(User $user, string $like)
    {
        $query = Task::where('title', 'like', $like);

        if (!$this->seesAllProjects($user)) {
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

        return $query->with('project:id,name')
            ->select('id', 'title', 'status', 'priority', 'project_id')
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get()
            ->map(fn ($t) => [
                'id' => $t->id,
                'title' => $t->title,
                'status' => $t->status,
                'priority' => $t->priority,
                'project_name' => $t->project?->name,
                'url' => $t->project_id ? "/projects/{$t->project_id}" : "/tasks/{$t->id}/edit",
            ]);
    }

    /**
     * Approval projects, mirroring ApprovalProjectPolicy::view — the approver
     * capability is required, then admins/executives see all and everyone else
     * sees only what they own or belong to.
     */
    private function approvalProjects(User $user, string $like)
    {
        if (!$user->can_approve) {
            return collect();
        }

        $query = ApprovalProject::where('name', 'like', $like);

        if (!$user->can('manage-approval-projects') && !$user->hasRole('executive')) {
            $query->where(function ($q) use ($user) {
                $q->where('owner_id', $user->id)
                    ->orWhereHas('members', fn ($m) => $m->where('user_id', $user->id));
            });
        }

        return $query->with('owner:id,name')
            ->select('id', 'name', 'status', 'owner_id')
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get()
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'status' => $p->status,
                'owner' => $p->owner?->name,
                'url' => "/approval-projects/{$p->id}",
            ]);
    }

    /**
     * Items awaiting/undergoing approval, mirroring ApprovalItemPolicy::view —
     * requester, project owner/member, or an approver on any of its steps.
     */
    private function approvalItems(User $user, string $like)
    {
        $query = ApprovalItem::where(function ($q) use ($like) {
            $q->where('title', 'like', $like)
                ->orWhere('description', 'like', $like);
        });

        // Mirrors ApprovalItemPolicy::view exactly — note it grants no blanket
        // admin access, so there is deliberately no manage-approval-projects
        // bypass here. Surfacing an item the user then can't open would only
        // produce a 403, and would leak request titles to non-participants.
        $query->where(function ($q) use ($user) {
            $q->where('requested_by', $user->id)
                ->orWhereHas('approvalProject', function ($p) use ($user) {
                    $p->where('owner_id', $user->id)
                        ->orWhereHas('members', fn ($m) => $m->where('user_id', $user->id));
                })
                // An eligible approver on the *currently active* step...
                ->orWhereHas('stepInstances', function ($s) use ($user) {
                    $s->where('status', 'active')
                        ->whereHas('approvers', fn ($a) => $a->where('user_id', $user->id));
                })
                // ...or anyone who already recorded a decision on it.
                ->orWhereHas('stepInstances.decisions', fn ($d) => $d->where('decided_by', $user->id));
        });

        return $query->with(['approvalProject:id,name', 'requester:id,name'])
            ->select('id', 'title', 'status', 'approval_project_id', 'requested_by', 'archived_at')
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get()
            ->map(fn ($i) => [
                'id' => $i->id,
                'title' => $i->title,
                'status' => $i->status,
                'project_name' => $i->approvalProject?->name,
                'requester' => $i->requester?->name,
                'archived' => (bool) $i->archived_at,
                'url' => "/approval-projects/{$i->approval_project_id}/items/{$i->id}",
            ]);
    }

    private function users(User $user, string $like)
    {
        if (!$user->can('view-users')) {
            return collect();
        }

        return User::where(function ($query) use ($like) {
            $query->where('name', 'like', $like)
                ->orWhere('email', 'like', $like);
        })
            ->select('id', 'name', 'email', 'position')
            ->where('is_active', true)
            ->orderBy('name')
            ->take(5)
            ->get()
            ->map(fn ($u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'position' => $u->position,
                'url' => '/users',
            ]);
    }
}
