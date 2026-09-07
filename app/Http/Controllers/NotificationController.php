<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

class NotificationController extends Controller
{
    /**
     * The notifications that belong to work in a project, and so can be
     * gathered under it.
     *
     * An explicit list rather than "anything carrying a project_id": approval
     * items carry one too, and it is the id of an *approval* project — grouping
     * on the field alone would file them under whichever real project happens
     * to share the number, and link there.
     */
    private const GROUPABLE_TYPES = [
        'task_assigned',
        'task_comment',
        'subtask_comment',
        'task_comment_mention',
        'comment_deleted',
        'task_due_soon',
        'task_due_reminder',
        'task_overdue',
        'task_escalated',
        'automation_blocked',
    ];

    /** Two of anything is a pile; one is just a notification. */
    private const MIN_GROUP = 2;

    /** How many entries a group shows before it needs asking. */
    public const COLLAPSED_ENTRIES = 4;

    /** The filters where gathering helps. Bookmarks and the archive are lists
     * somebody curated; the mention tab is already one thing. */
    private const GROUPED_FILTERS = ['inbox', 'unread'];

    public function index(Request $request): Response
    {
        $filter = $request->query('filter', 'inbox');

        $query = $request->user()->notifications();

        switch ($filter) {
            case 'unread':
                $query->whereNull('read_at')->whereNull('archived_at');
                break;
            case 'bookmarked':
                $query->whereNotNull('bookmarked_at')->whereNull('archived_at');
                break;
            case 'archived':
                $query->whereNotNull('archived_at');
                break;
            case 'mentioned':
                $query->where('type', 'like', '%TaskCommentMentionNotification')
                    ->whereNull('archived_at');
                break;
            default: // inbox
                $query->whereNull('archived_at');
                break;
        }

        $groups = in_array($filter, self::GROUPED_FILTERS, true)
            ? $this->groupsFor($request->user())
            : collect();

        // What a group stands for is not also listed under it: sixty-three rows
        // gathered into one line, and then sixty-three rows.
        $absorbed = $groups->pluck('notification_ids')->flatten();

        if ($absorbed->isNotEmpty()) {
            $query->whereNotIn('id', $absorbed);
        }

        $notifications = $query->paginate(15)->appends(['filter' => $filter]);

        return Inertia::render('Inbox/Index', [
            'notifications' => $notifications,
            'filter' => $filter,
            'groups' => $groups->map(fn (array $g) => Arr::except($g, ['notification_ids']))->values(),
            'collapsedEntries' => self::COLLAPSED_ENTRIES,
        ]);
    }

    /**
     * Unread project notifications, gathered under the project they came from.
     *
     * Bounded by what is unread rather than by everything ever received, so this
     * loads a person's outstanding work and not their history.
     *
     * The project's name is read from the projects table rather than from the
     * payload: the payload is a snapshot of the day it was sent, and a project
     * renamed since would otherwise be filed under a name nobody recognises. A
     * project that has been deleted keeps no group at all — its notifications
     * stay as ordinary rows, still readable, just not gathered under a heading
     * that leads nowhere.
     */
    private function groupsFor(User $user): Collection
    {
        $candidates = $this->groupable($user);

        if ($candidates->isEmpty()) {
            return collect();
        }

        $byProject = $candidates
            ->groupBy(fn ($n) => (int) $n->data['project_id'])
            ->filter(fn (Collection $rows) => $rows->count() >= self::MIN_GROUP);

        if ($byProject->isEmpty()) {
            return collect();
        }

        $names = Project::whereIn('id', $byProject->keys())->pluck('name', 'id');

        return $byProject
            ->map(function (Collection $rows, int $projectId) use ($names) {
                if (! $names->has($projectId)) {
                    return null;    // the project is gone; so is the heading
                }

                return [
                    'project_id' => $projectId,
                    'project_name' => $names[$projectId],
                    'unread_count' => $rows->count(),
                    'latest_at' => $rows->max('created_at')?->toIso8601String(),
                    'notification_ids' => $rows->pluck('id')->all(),
                    'entries' => $rows->sortByDesc('created_at')->values()->map(fn ($n) => [
                        'id' => $n->id,
                        'data' => $n->data,
                        'created_at' => $n->created_at->toIso8601String(),
                        'bookmarked_at' => $n->bookmarked_at?->toIso8601String(),
                    ])->all(),
                ];
            })
            ->filter()
            // Newest activity first, matching the list underneath.
            ->sortByDesc('latest_at')
            ->values();
    }

    /**
     * The set a group may be made of, and the exact set its buttons act on.
     *
     * One method for both, so what a person sees gathered under a heading and
     * what "mark all read" marks cannot come apart.
     *
     * The last filter is in PHP on purpose: a standalone task carries no project
     * at all, and its notification stores project_id as null — which MySQL's
     * json_extract hands back as a JSON null that SQL happily calls "not null".
     */
    private function groupable(User $user): Collection
    {
        return $user->notifications()
            ->whereNull('read_at')
            ->whereNull('archived_at')
            ->whereIn('data->type', self::GROUPABLE_TYPES)
            ->get()
            ->filter(fn ($n) => ! empty($n->data['project_id']));
    }

    /** Clear a whole project's unread notifications in one go. */
    public function markProjectAsRead(Request $request, int $project): RedirectResponse
    {
        $ids = $this->idsForProject($request->user(), $project);

        if ($ids->isNotEmpty()) {
            $request->user()->notifications()->whereIn('id', $ids)->update(['read_at' => now()]);
        }

        return back();
    }

    /** Put a whole project's unread notifications out of the way. */
    public function archiveProject(Request $request, int $project): RedirectResponse
    {
        $ids = $this->idsForProject($request->user(), $project);

        if ($ids->isNotEmpty()) {
            $request->user()->notifications()->whereIn('id', $ids)->update(['archived_at' => now()]);
        }

        return back();
    }

    /** Exactly the notifications the group on screen is made of. */
    private function idsForProject(User $user, int $project): Collection
    {
        return $this->groupable($user)
            ->filter(fn ($n) => (int) $n->data['project_id'] === $project)
            ->pluck('id');
    }

    public function markAsRead(Request $request, string $id): RedirectResponse
    {
        $notification = $request->user()
            ->notifications()
            ->findOrFail($id);

        $notification->markAsRead();

        return back();
    }

    public function recent(Request $request): JsonResponse
    {
        $notifications = $request->user()
            ->notifications()
            ->whereNull('archived_at')
            ->take(5)
            ->get()
            ->map(fn ($n) => [
                'id' => $n->id,
                'data' => $n->data,
                'read_at' => $n->read_at?->toIso8601String(),
                'bookmarked_at' => $n->bookmarked_at?->toIso8601String(),
                'created_at' => $n->created_at->toIso8601String(),
            ]);

        return response()->json(['notifications' => $notifications]);
    }

    public function markAllAsRead(Request $request): RedirectResponse
    {
        $request->user()->unreadNotifications->markAsRead();

        return back()->with('success', 'All notifications marked as read.');
    }

    public function toggleBookmark(Request $request, string $id): RedirectResponse
    {
        $notification = $request->user()
            ->notifications()
            ->findOrFail($id);

        $notification->update([
            'bookmarked_at' => $notification->bookmarked_at ? null : now(),
        ]);

        return back();
    }

    public function archive(Request $request, string $id): RedirectResponse
    {
        $notification = $request->user()
            ->notifications()
            ->findOrFail($id);

        $notification->update([
            'archived_at' => now(),
        ]);

        return back();
    }

    public function unarchive(Request $request, string $id): RedirectResponse
    {
        $notification = $request->user()
            ->notifications()
            ->findOrFail($id);

        $notification->update([
            'archived_at' => null,
        ]);

        return back();
    }
}
