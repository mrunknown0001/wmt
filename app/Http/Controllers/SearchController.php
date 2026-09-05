<?php

namespace App\Http\Controllers;

use App\Models\ApprovalItem;
use App\Models\ApprovalProject;
use App\Models\Folder;
use App\Models\Project;
use App\Models\Tag;
use App\Models\Task;
use App\Models\TaskMinute;
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
        'minutes' => [],
        'approvalProjects' => [],
        'approvalItems' => [],
        'users' => [],
        'tags' => [],
    ];

    public function __invoke(Request $request): JsonResponse
    {
        $q = trim((string) $request->input('q', ''));

        // "#budget" says the word is a label rather than a word that might
        // appear in a title. Typed by anybody who has clicked a tag chip, since
        // that is the search a chip runs.
        $tagOnly = str_starts_with($q, '#');
        $term = $tagOnly ? trim(substr($q, 1)) : $q;

        if (strlen($term) < 2) {
            return response()->json(self::EMPTY_RESULTS);
        }

        $user = $request->user();
        $like = '%' . $term . '%';

        return response()->json([
            'projects' => $this->projects($user, $like, $tagOnly),
            'folders' => $tagOnly ? collect() : $this->folders($user, $like),
            'tasks' => $this->tasks($user, $like, $tagOnly),
            'minutes' => $this->minutes($user, $like, $tagOnly),
            'approvalProjects' => $tagOnly ? collect() : $this->approvalProjects($user, $like),
            'approvalItems' => $tagOnly ? collect() : $this->approvalItems($user, $like),
            'users' => $tagOnly ? collect() : $this->users($user, $like),
            'tags' => $this->tags($like),
        ]);
    }

    /**
     * The labels themselves, so a search names the vocabulary it matched.
     *
     * Deliberately unscoped: a tag is a word, and knowing that "budget" exists
     * reveals nothing about the work carrying it — the sections above are what
     * decide who sees which records.
     */
    private function tags(string $like)
    {
        return Tag::where('name', 'like', $like)
            ->withCount(['projects', 'tasks', 'minutes'])
            ->get()
            ->map(fn (Tag $tag) => [
                'id' => $tag->id,
                'name' => $tag->name,
                'slug' => $tag->slug,
                'uses' => $tag->projects_count + $tag->tasks_count + $tag->minutes_count,
            ])
            ->filter(fn ($tag) => $tag['uses'] > 0)
            ->sortByDesc('uses')
            ->take(5)
            ->values();
    }

    /**
     * Minutes of a meeting, found by what the meeting was called or by a label.
     *
     * The body is deliberately not searched. It is nine JSON documents of
     * discussion and every meeting mentions everything, so matching inside it
     * returns the whole archive for any common word — a tag is the handle that
     * actually narrows.
     */
    private function minutes(User $user, string $like, bool $tagOnly = false)
    {
        $query = TaskMinute::query()->where(function ($q) use ($like, $tagOnly) {
            if (! $tagOnly) {
                $q->where('meeting_title', 'like', $like)
                    ->orWhere('venue', 'like', $like);
            }

            $q->orWhereHas('tags', fn ($t) => $t->where('name', 'like', $like));
        });

        // Minutes are part of their task, and inherit its visibility exactly.
        if (! $this->seesAllProjects($user)) {
            $query->whereHas('task', function ($t) use ($user) {
                $t->whereHas('project', fn ($p) => $this->scopeVisibleProjects($p, $user))
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

        return $query->with(['task:id,title,project_id', 'task.project:id,name', 'tags:id,name,slug'])
            ->orderBy('meeting_date', 'desc')
            ->take(5)
            ->get()
            ->map(fn (TaskMinute $m) => [
                'id' => $m->id,
                'title' => $m->meeting_title ?: ($m->task?->title ?? 'Minutes'),
                'meeting_date' => $m->meeting_date?->toDateString(),
                'task_title' => $m->task?->title,
                'project_name' => $m->task?->project?->name,
                'tags' => $m->tags->map(fn ($t) => $t->name),
                'url' => $m->task?->project_id
                    ? "/projects/{$m->task->project_id}/tasks/{$m->task_id}/edit"
                    : "/tasks/{$m->task_id}/edit",
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

    private function projects(User $user, string $like, bool $tagOnly = false)
    {
        $query = Project::where(function ($q) use ($like, $tagOnly) {
            if (! $tagOnly) {
                $q->where('name', 'like', $like);
            }

            // A label is as good a handle as a name, and often better: nobody
            // remembers what the project was called, but they remember it was
            // the hatchery work.
            $q->orWhereHas('tags', fn ($t) => $t->where('name', 'like', $like));
        });
        $this->scopeVisibleProjects($query, $user);

        return $query->with(['owner:id,name', 'tags:id,name,slug'])
            ->select('id', 'name', 'status', 'owner_id')
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get()
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'status' => $p->status,
                'owner' => $p->owner?->name,
                'tags' => $p->tags->map(fn ($t) => $t->name),
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
    private function tasks(User $user, string $like, bool $tagOnly = false)
    {
        // Match the reference number as well as the title. Numbers are what
        // people paste in from an email or a chat message, and a number that
        // can't be looked up is not much of a reference. And match a label,
        // which is how somebody finds work they cannot name.
        $query = Task::where(function ($q) use ($like, $tagOnly) {
            if (! $tagOnly) {
                $q->where('title', 'like', $like)
                    ->orWhere('series_number', 'like', $like);
            }

            $q->orWhereHas('tags', fn ($t) => $t->where('name', 'like', $like));
        });

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

        return $query->with(['project:id,name', 'tags:id,name,slug'])
            ->select('id', 'title', 'series_number', 'status', 'priority', 'project_id')
            // An exact number match is almost certainly the thing being looked
            // for, so float it above the recently-touched tasks.
            ->orderByRaw('case when series_number = ? then 0 else 1 end', [trim($like, '%')])
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get()
            ->map(fn ($t) => [
                'id' => $t->id,
                'title' => $t->title,
                'series_number' => $t->series_number,
                'status' => $t->status,
                'priority' => $t->priority,
                'project_name' => $t->project?->name,
                'tags' => $t->tags->map(fn ($tag) => $tag->name),
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
        if (!$user->canAccessApprovals()) {
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
