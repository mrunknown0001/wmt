<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Models\ApprovalProject;
use App\Models\Department;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskDelegation;
use App\Models\TaskDelegationItem;
use App\Models\Team;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\OrgScope;
use App\Services\UserHandover;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Permission\Models\Role;

class UserController extends Controller
{
    public function index(Request $request): Response
    {
        $this->authorize('viewAny', User::class);

        $query = User::with('roles', 'department', 'team');

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', '%' . $search . '%')
                    ->orWhere('email', 'like', '%' . $search . '%');
            });
        }

        if ($role = $request->input('role')) {
            $query->whereHas('roles', fn ($q) => $q->where('name', $role));
        }

        if ($request->filled('status')) {
            $query->where('is_active', $request->input('status') === 'active');
        }

        $users = $query->orderBy('name')
            ->paginate(20)
            ->withQueryString();

        return Inertia::render('Users/Index', [
            'users' => $users,
            'roles' => Role::orderBy('name')->pluck('name'),
            'filters' => [
                'search' => $request->input('search', ''),
                'role' => $request->input('role', ''),
                'status' => $request->input('status', ''),
            ],
            'cover' => $this->coverFor($users->getCollection()),
            'openTasks' => $this->openTaskCounts($users->getCollection()),
            'ownedProjects' => $this->ownedProjectCounts($users->getCollection()),
            // Executives can see this list but the cover page has its own
            // authority rule, so the action only appears for people it will
            // actually let in.
            'canArrangeCover' => OrgScope::hasAnyScope($request->user()),
        ]);
    }

    /**
     * Unfinished task counts for the people on this page.
     *
     * One grouped query rather than one per row, and returned as a list for the
     * same reason as the cover data: integer keys serialise to a JSON array
     * when they happen to run 0..n.
     *
     * @param  \Illuminate\Support\Collection<int, User>  $users
     */
    private function openTaskCounts($users): array
    {
        if ($users->isEmpty()) {
            return [];
        }

        return Task::query()
            ->whereIn('assigned_to', $users->pluck('id'))
            ->whereNotIn('status', Task::CLOSING_STATUSES)
            ->groupBy('assigned_to')
            ->selectRaw('assigned_to as user_id, count(*) as total')
            ->get()
            ->map(fn ($row) => ['user_id' => (int) $row->user_id, 'total' => (int) $row->total])
            ->all();
    }

    /**
     * How many projects of either kind each person on this page owns.
     *
     * @param  \Illuminate\Support\Collection<int, User>  $users
     */
    private function ownedProjectCounts($users): array
    {
        if ($users->isEmpty()) {
            return [];
        }

        $ids = $users->pluck('id');

        $tally = [];

        foreach ([Project::class, ApprovalProject::class] as $model) {
            $rows = $model::query()
                ->whereIn('owner_id', $ids)
                ->groupBy('owner_id')
                ->selectRaw('owner_id, count(*) as total')
                ->pluck('total', 'owner_id');

            foreach ($rows as $ownerId => $total) {
                $tally[(int) $ownerId] = ($tally[(int) $ownerId] ?? 0) + (int) $total;
            }
        }

        return collect($tally)
            ->map(fn ($total, $userId) => ['user_id' => (int) $userId, 'total' => $total])
            ->values()
            ->all();
    }

    /**
     * Hand a departing person's unfinished work to somebody else, for good.
     *
     * Admin only — manage-users, not view-users, so executives who can read the
     * staff list cannot reassign a colleague's whole workload.
     */
    public function transferTasks(Request $request, User $user): RedirectResponse
    {
        abort_unless($request->user()->can('manage-users'), 403);

        $data = $request->validate([
            'to_user_id' => ['required', 'integer', 'exists:users,id', 'different:' . $user->id],
        ]);

        $recipient = User::findOrFail($data['to_user_id']);

        if ((int) $recipient->id === (int) $user->id) {
            throw ValidationException::withMessages([
                'to_user_id' => 'Choose somebody other than the person leaving.',
            ]);
        }

        if (! $recipient->is_active) {
            throw ValidationException::withMessages([
                'to_user_id' => 'That person is not active, so the work would have nobody to do it.',
            ]);
        }

        $result = UserHandover::transfer($user, $recipient, $request->user());

        $tasks = $result['tasks'];
        $projects = $result['projects'] + $result['approval_projects'];

        if ($tasks === 0 && $projects === 0) {
            return back()->with('success', "{$user->name} had nothing to hand over.");
        }

        $parts = [];

        if ($tasks > 0) {
            $parts[] = "{$tasks} unfinished " . str('task')->plural($tasks);
        }

        if ($projects > 0) {
            $parts[] = "{$projects} " . str('project')->plural($projects);
        }

        return back()->with(
            'success',
            implode(' and ', $parts) . " moved to {$recipient->name}."
        );
    }

    /**
     * Current or upcoming task cover for the people on this page.
     *
     * One query for the whole page rather than a relation on User: cover that
     * has already finished is of no interest here, and eager-loading every
     * delegation ever arranged would grow without bound.
     *
     * Returned as a list rather than a map keyed by user id — PHP's integer
     * keys serialise to a JSON array when they happen to run 0..n, which would
     * silently change the shape the page receives.
     *
     * @param  \Illuminate\Support\Collection<int, User>  $users
     */
    private function coverFor($users): array
    {
        if ($users->isEmpty()) {
            return [];
        }

        return TaskDelegation::with('delegates:id,name')
            // Whole-person cover only — the list column is about someone being
            // away, not a single task on loan.
            ->whereNull('task_id')
            ->whereIn('user_id', $users->pluck('id'))
            ->whereIn('status', [TaskDelegation::SCHEDULED, TaskDelegation::ACTIVE])
            ->whereDate('ends_on', '>=', now()->toDateString())
            ->orderBy('starts_on')
            ->get()
            // Someone can have at most one live arrangement, but a finished one
            // and a scheduled one can coexist; the soonest is the useful one.
            ->unique('user_id')
            ->map(fn (TaskDelegation $d) => [
                'id' => $d->id,
                'user_id' => $d->user_id,
                'running' => $d->isRunning(),
                'period' => $d->periodLabel(),
                'starts_on' => $d->starts_on->toDateString(),
                'ends_on' => $d->ends_on->toDateString(),
                'delegates' => $d->delegates->pluck('name')->all(),
            ])
            ->values()
            ->all();
    }

    /**
     * User Overview — KPIs for a single user (projects, task throughput,
     * productivity, activity). Reachable from the Users list and from the
     * Executive Dashboard member drill-down.
     */
    public function show(Request $request, User $user): Response
    {
        abort_unless($this->canViewOverview($request->user(), $user), 403);

        $user->load('department.division', 'team', 'roles:id,name');

        $tasks = \App\Models\Task::where('assigned_to', $user->id);
        $total = (clone $tasks)->count();
        $completed = (clone $tasks)->where('status', 'done')->count();
        $active = (clone $tasks)->whereNotIn('status', ['done', 'cancelled'])->count();
        // whereDate, not where('<', now()): due_date is a date column, so
        // comparing it to a full timestamp made anything due *today* count as
        // overdue from midnight. The Overdue tab below reads date-only, as does
        // the rest of the app, and the two sat side by side disagreeing.
        $overdue = (clone $tasks)->whereNotIn('status', ['done', 'cancelled'])
            ->pastDue()->count();

        // On-time rate over completed tasks that had a due date.
        $completedWithDue = (clone $tasks)->where('status', 'done')->whereNotNull('due_date')->whereNotNull('completed_at');
        $completedDueTotal = (clone $completedWithDue)->count();
        $completedOnTime = (clone $completedWithDue)
            ->whereColumn('completed_at', '<=', 'due_date')->count();

        // Activity: log entries over the last 30 days, and the most recent one.
        $since = now()->subDays(30);
        $activity30 = \App\Models\ActivityLog::where('user_id', $user->id)->where('created_at', '>=', $since)->count();
        $lastActivity = \App\Models\ActivityLog::where('user_id', $user->id)->max('created_at');

        $projectsOwned = \App\Models\Project::where('owner_id', $user->id)->count();
        $projectsMember = $user->memberProjects()->count();
        // Projects the user actually works in (owns, is a member of, or has a task in).
        $projectsInvolved = \App\Models\Project::where('owner_id', $user->id)
            ->orWhereHas('members', fn ($q) => $q->where('users.id', $user->id))
            ->orWhereHas('tasks', fn ($q) => $q->where('assigned_to', $user->id))
            ->count();

        $completionRate = $total > 0 ? round(($completed / $total) * 100) : 0;
        $onTimeRate = $completedDueTotal > 0 ? round(($completedOnTime / $completedDueTotal) * 100) : 0;

        // Composite productivity: completion, punctuality, and recent activity.
        $activityScore = min(100, $activity30 * 5); // 20 actions/30d ≈ fully active
        $productivity = round($completionRate * 0.5 + $onTimeRate * 0.3 + $activityScore * 0.2);

        $recentActivity = \App\Models\ActivityLog::where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->limit(12)
            ->get(['action', 'entity_type', 'entity_name', 'description', 'created_at'])
            ->map(fn ($a) => [
                'action' => $a->action,
                'entity' => $a->entity_name ?: class_basename($a->entity_type ?? ''),
                'description' => $a->description,
                'created_at' => $a->created_at,
            ]);

        // Who is looking, and what they may do here. Arranging cover — whole
        // workload or a single task — is a manager's act over someone they run;
        // a permanent hand-over is admin-only. Both are gated again server-side.
        $viewer = $request->user();
        $canArrangeCover = OrgScope::hasAnyScope($viewer) && OrgScope::manages($viewer, $user->id);
        $canHandover = $viewer->can('manage-users');

        return Inertia::render('Users/Show', [
            'profile' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'position' => $user->position,
                'is_active' => (bool) $user->is_active,
                'department' => $user->department?->name,
                'division' => $user->department?->division?->name,
                'team' => $user->team?->name,
                'roles' => $user->roles->pluck('name'),
            ],
            // Records behind whichever card was clicked, or null for the default
            // Tasks view. A partial reload refreshes only this key.
            'filtered' => $this->buildFilter($user, $request->query('filter')),
            // Tasks this person has out on cover right now (single-task or swept
            // up by whole-person cover): assigned elsewhere, still owed back.
            'delegatedAway' => $this->delegatedAwayTasks($user),
            'canArrangeCover' => $canArrangeCover,
            'canHandover' => $canHandover,
            // The stand-ins a manager may pick from — only loaded when they can
            // actually arrange cover, and narrowed to the people they run.
            'coverPeople' => $canArrangeCover
                ? OrgScope::manageablePeople($viewer)
                    ->map(fn ($p) => ['id' => $p->id, 'name' => $p->name])
                    ->values()
                : [],
            // Whole-person cover currently set up for this person, if any.
            'currentCover' => $this->currentCoverFor($user),
            // Counts for the permanent hand-over prompt, admin-only.
            'handover' => $canHandover ? [
                'open_tasks' => UserHandover::pendingFor($user)->count(),
                'owned_projects' => UserHandover::ownedProjects($user),
            ] : null,
            // Recipients for a permanent hand-over. Kept separate from
            // coverPeople because that one is empty for an inactive person —
            // exactly the case a hand-over is for — and would leave nobody to
            // pick. Any active person other than the one leaving.
            'handoverPeople' => $canHandover
                ? User::where('is_active', true)
                    ->where('id', '!=', $user->id)
                    ->orderBy('name')
                    ->get(['id', 'name'])
                    ->map(fn ($p) => ['id' => $p->id, 'name' => $p->name])
                    ->values()
                : [],
            'kpis' => [
                'projectsOwned' => $projectsOwned,
                'projectsMember' => $projectsMember,
                'projectsInvolved' => $projectsInvolved,
                'tasksTotal' => $total,
                'tasksCompleted' => $completed,
                'tasksActive' => $active,
                'tasksOverdue' => $overdue,
                'completionRate' => $completionRate,
                'onTimeRate' => $onTimeRate,
                'productivity' => $productivity,
                'activity30' => $activity30,
                'lastActivityAt' => $lastActivity,
            ],
            'recentActivity' => $recentActivity,
            'upcoming' => $this->upcomingTasks($user),
            'canManage' => $request->user()->can('manage-users'),
        ]);
    }

    /**
     * What this person is carrying: overdue, due this week, due this month.
     *
     * Unfinished work only. Week and month overlap on purpose — the month is a
     * superset of the week, so the card offers them as a toggle over one list
     * rather than two lists that would show the same task twice.
     *
     * Overdue is kept as its own list rather than another flag on that one.
     * Sharing a capped list would let a long backlog crowd the upcoming tabs
     * out entirely, which is exactly when a supervisor most needs to see both.
     *
     * Every count comes from its own query, so the tab badges stay right even
     * when the list beneath them is capped.
     */
    private function upcomingTasks(User $user): array
    {
        $today = now()->startOfDay();

        // Sunday-to-Saturday, matching the calendar rather than Carbon's
        // Monday default — the two pages should not disagree about "this week".
        $weekEnd = now()->endOfWeek(\Carbon\Carbon::SATURDAY)->startOfDay();
        $monthEnd = now()->endOfMonth()->startOfDay();

        // In the last days of a month the week runs past month end, so the
        // range has to cover whichever reaches further.
        $rangeEnd = $weekEnd->greaterThan($monthEnd) ? $weekEnd : $monthEnd;

        $unfinished = fn () => Task::query()
            ->where('assigned_to', $user->id)
            ->whereNotIn('status', Task::CLOSING_STATUSES)
            ->whereNotNull('due_date');

        $ahead = fn () => $unfinished()->whereDate('due_date', '>=', $today->toDateString());
        $behind = fn () => $unfinished()->whereDate('due_date', '<', $today->toDateString());

        $row = fn (Task $t) => [
            'id' => $t->id,
            'title' => $t->title,
            'status' => $t->status,
            'priority' => $t->priority,
            'due_date' => $t->due_date?->toDateString(),
            'due_time' => $t->due_time,
            'url' => $t->getEditUrl(),
            'project' => $t->project ? ['id' => $t->project->id, 'name' => $t->project->name] : null,
        ];

        $columns = ['id', 'project_id', 'title', 'status', 'priority', 'due_date', 'due_time'];

        $tasks = $ahead()->with('project:id,name')
            ->whereDate('due_date', '<=', $rangeEnd->toDateString())
            ->orderBy('due_date')
            // Timed work first within a day; undated-time tasks after it.
            ->orderByRaw('due_time is null, due_time')
            ->limit(self::UPCOMING_LIMIT)
            ->get($columns);

        // Oldest first — the longest-outstanding item is the one to look at.
        $overdue = $behind()->with('project:id,name')
            ->orderBy('due_date')
            ->orderByRaw('due_time is null, due_time')
            ->limit(self::UPCOMING_LIMIT)
            ->get($columns);

        return [
            'tasks' => $tasks->map(fn (Task $t) => $row($t) + [
                'in_week' => $t->due_date->startOfDay()->lessThanOrEqualTo($weekEnd),
                'in_month' => $t->due_date->startOfDay()->lessThanOrEqualTo($monthEnd),
            ])->values()->all(),
            'overdue' => $overdue->map(fn (Task $t) => $row($t) + [
                'days_late' => $t->due_date->startOfDay()->diffInDays($today),
            ])->values()->all(),
            'weekCount' => $ahead()->whereDate('due_date', '<=', $weekEnd->toDateString())->count(),
            'monthCount' => $ahead()->whereDate('due_date', '<=', $monthEnd->toDateString())->count(),
            'overdueCount' => $behind()->count(),
            'weekEnds' => $weekEnd->toDateString(),
            'monthEnds' => $monthEnd->toDateString(),
            'limit' => self::UPCOMING_LIMIT,
        ];
    }

    /** Enough to be useful on an overview without turning it into a task list. */
    private const UPCOMING_LIMIT = 50;

    /** A filtered list is a drill-down, not a report — cap it and say so. */
    private const FILTER_LIMIT = 100;

    /**
     * The records behind a clicked card.
     *
     * Every headline number on the page is an entry point: click it and the
     * page shows exactly the rows it counts. The keys mirror how each card is
     * computed in show(), so the list can never disagree with the figure that
     * opened it. Unknown or empty keys mean "no filter" — the default Tasks card
     * shows instead.
     *
     * @return array{key: string, type: string, label: string, items: array, count: int, limit: int}|null
     */
    private function buildFilter(User $user, ?string $filter): ?array
    {
        if (! $filter) {
            return null;
        }

        // Projects and activity are their own kinds of list; everything else is
        // a slice of this person's tasks.
        if (str_starts_with($filter, 'projects:')) {
            return $this->filteredProjects($user, substr($filter, strlen('projects:')));
        }

        if ($filter === 'activity') {
            return $this->filteredActivity($user);
        }

        return $this->filteredTasks($user, $filter);
    }

    /** Task slices, one per task-counting card. */
    private function filteredTasks(User $user, string $key): ?array
    {
        $base = fn () => Task::query()->where('assigned_to', $user->id);

        [$label, $query] = match ($key) {
            'all' => ['All tasks', $base()],
            'active' => ['Active tasks', $base()->whereNotIn('status', Task::CLOSING_STATUSES)],
            'completed' => ['Completed tasks', $base()->where('status', 'done')],
            'overdue' => ['Overdue tasks', $base()->whereNotIn('status', Task::CLOSING_STATUSES)->pastDue()],
            // Completed on or before the due date — the on-time numerator.
            'ontime' => ['Completed on time', $base()->where('status', 'done')
                ->whereNotNull('due_date')->whereNotNull('completed_at')
                ->whereColumn('completed_at', '<=', 'due_date')],
            default => [null, null],
        };

        if ($label === null) {
            return null;
        }

        $count = (clone $query)->count();

        // Open work by soonest due; finished work by most recently done.
        $ordered = in_array($key, ['completed', 'ontime'], true)
            ? $query->orderByDesc('completed_at')
            : $query->orderByRaw('due_date is null, due_date');

        $today = now()->startOfDay();

        $items = $ordered->with('project:id,name')
            ->limit(self::FILTER_LIMIT)
            ->get(['id', 'project_id', 'title', 'status', 'priority', 'due_date', 'due_time', 'completed_at', 'assigned_to'])
            ->map(fn (Task $t) => [
                'id' => $t->id,
                'title' => $t->title,
                'status' => $t->status,
                'priority' => $t->priority,
                'due_date' => $t->due_date?->toDateString(),
                'due_time' => $t->due_time,
                'completed_at' => $t->completed_at?->toDateString(),
                'url' => $t->getEditUrl(),
                'project' => $t->project ? ['id' => $t->project->id, 'name' => $t->project->name] : null,
                'is_overdue' => ! in_array($t->status, Task::CLOSING_STATUSES, true)
                    && $t->due_date && $t->due_date->startOfDay()->lessThan($today),
                // Open tasks still assigned to this person can be handed over.
                'reassignable' => ! in_array($t->status, Task::CLOSING_STATUSES, true),
            ])
            ->all();

        return ['key' => "tasks:{$key}", 'type' => 'tasks', 'label' => $label, 'items' => $items, 'count' => $count, 'limit' => self::FILTER_LIMIT];
    }

    /** Project slices, one per Projects-card row. */
    private function filteredProjects(User $user, string $key): ?array
    {
        [$label, $query] = match ($key) {
            'owned' => ['Owned projects', Project::where('owner_id', $user->id)],
            'member' => ['Projects they are a member of', Project::whereHas('members', fn ($q) => $q->where('users.id', $user->id))],
            'involved' => ['Projects involved in', Project::where('owner_id', $user->id)
                ->orWhereHas('members', fn ($q) => $q->where('users.id', $user->id))
                ->orWhereHas('tasks', fn ($q) => $q->where('assigned_to', $user->id))],
            default => [null, null],
        };

        if ($label === null) {
            return null;
        }

        $count = (clone $query)->count();

        $ownedIds = Project::where('owner_id', $user->id)->pluck('id')->flip();

        $items = $query->orderByDesc('id')
            ->limit(self::FILTER_LIMIT)
            ->get(['id', 'name', 'status', 'owner_id', 'due_date'])
            ->map(fn (Project $p) => [
                'id' => $p->id,
                'name' => $p->name,
                'status' => $p->status,
                'due_date' => $p->due_date?->toDateString(),
                'url' => "/projects/{$p->id}",
                'role' => $ownedIds->has($p->id) ? 'owner' : 'member',
            ])
            ->all();

        return ['key' => "projects:{$key}", 'type' => 'projects', 'label' => $label, 'items' => $items, 'count' => $count, 'limit' => self::FILTER_LIMIT];
    }

    /** This person's actions over the last 30 days. */
    private function filteredActivity(User $user): array
    {
        $since = now()->subDays(30);

        $query = \App\Models\ActivityLog::where('user_id', $user->id)
            ->where('created_at', '>=', $since);

        $count = (clone $query)->count();

        $items = $query->orderByDesc('created_at')
            ->limit(self::FILTER_LIMIT)
            ->get(['action', 'entity_type', 'entity_name', 'description', 'created_at'])
            ->map(fn ($a) => [
                'action' => $a->action,
                'entity' => $a->entity_name ?: class_basename($a->entity_type ?? ''),
                'description' => $a->description,
                'created_at' => $a->created_at,
            ])
            ->all();

        return ['key' => 'activity', 'type' => 'activity', 'label' => 'Activity in the last 30 days', 'items' => $items, 'count' => $count, 'limit' => self::FILTER_LIMIT];
    }

    /**
     * Tasks this person owns that are sitting with a stand-in right now.
     *
     * Read from the ledger, not from assigned_to: once a task is covered it is
     * assigned to the stand-in, so it drops out of every count on this page.
     * Surfacing it here keeps a reassigned task visible to the manager who moved
     * it, and gives them somewhere to end a single-task cover early.
     */
    private function delegatedAwayTasks(User $user): array
    {
        return TaskDelegationItem::query()
            ->whereNull('restored_at')
            ->where('original_assignee_id', $user->id)
            ->with([
                'task:id,project_id,title,status,priority,due_date',
                'task.project:id,name',
                'delegate:id,name',
                'delegation:id,ends_on,task_id,status',
            ])
            ->get()
            // A task that was hard-deleted leaves a dangling item; skip it.
            ->filter(fn (TaskDelegationItem $i) => $i->task && $i->delegation)
            ->map(fn (TaskDelegationItem $i) => [
                'task' => [
                    'id' => $i->task->id,
                    'title' => $i->task->title,
                    'status' => $i->task->status,
                    'priority' => $i->task->priority,
                    'url' => $i->task->getEditUrl(),
                    'project' => $i->task->project ? ['id' => $i->task->project->id, 'name' => $i->task->project->name] : null,
                ],
                'delegate' => $i->delegate?->name,
                'ends_on' => $i->delegation->ends_on?->toDateString(),
                'delegation_id' => $i->delegation->id,
                // Only a single-task cover can be ended for this one task alone;
                // ending whole-person cover would return everything at once.
                'per_task' => $i->delegation->task_id !== null,
            ])
            ->values()
            ->all();
    }

    /**
     * Whole-person cover set up for this person, scheduled or running, whose
     * last day has not passed. The soonest is the useful one.
     */
    private function currentCoverFor(User $user): ?array
    {
        $cover = TaskDelegation::with('delegates:id,name')
            ->whereNull('task_id')
            ->where('user_id', $user->id)
            ->whereIn('status', [TaskDelegation::SCHEDULED, TaskDelegation::ACTIVE])
            ->whereDate('ends_on', '>=', now()->toDateString())
            ->orderBy('starts_on')
            ->first();

        if (! $cover) {
            return null;
        }

        return [
            'id' => $cover->id,
            'running' => $cover->isRunning(),
            'period' => $cover->periodLabel(),
            'starts_on' => $cover->starts_on->toDateString(),
            'ends_on' => $cover->ends_on->toDateString(),
            'delegates' => $cover->delegates->pluck('name')->all(),
        ];
    }

    /**
     * Who may view a user's overview: managers, the user themselves, or a head
     * who oversees them (team leader ▸ department head ▸ division head).
     */
    private function canViewOverview(User $viewer, User $target): bool
    {
        if ($viewer->id === $target->id
            || $viewer->can('manage-users')
            || $viewer->can('view-users')
            || $viewer->hasRole('admin')
            || $viewer->hasRole('executive')) {
            return true;
        }

        // Team leader of the target's team.
        if ($target->team_id && Team::where('id', $target->team_id)->where('leader_id', $viewer->id)->exists()) {
            return true;
        }

        // Which department the target sits in. Usually their own column, but
        // somebody filed against a team and not a department still belongs to
        // that team's department — My Personnel lists them there, so the
        // overview has to agree or the link would 403.
        $departmentId = $target->department_id
            ?: ($target->team_id ? Team::where('id', $target->team_id)->value('department_id') : null);

        if (!$departmentId) {
            return false;
        }

        // Head of the target's department.
        if (Department::where('id', $departmentId)->where('head_id', $viewer->id)->exists()) {
            return true;
        }

        // Head of the division that department belongs to.
        $divisionId = Department::where('id', $departmentId)->value('division_id');

        return $divisionId
            && \App\Models\Division::where('id', $divisionId)->where('head_id', $viewer->id)->exists();
    }

    public function create(): Response
    {
        $this->authorize('create', User::class);

        return Inertia::render('Users/Create', [
            'roles' => Role::orderBy('name')->pluck('name'),
            'departments' => Department::with('division')->orderBy('name')->get(['id', 'name', 'division_id']),
            'teams' => Team::orderBy('name')->get(['id', 'name', 'department_id']),
        ]);
    }

    public function store(StoreUserRequest $request): RedirectResponse
    {
        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => $request->password,
            'department_id' => $request->department_id,
            'team_id' => $request->team_id,
            'position' => $request->position,
            'is_active' => $request->boolean('is_active', true),
            'can_create_rules' => $request->boolean('can_create_rules', false),
            'can_approve' => $request->boolean('can_approve', false),
            'can_create_project' => $request->boolean('can_create_project', false),
            'daily_capacity_minutes' => $request->integer('daily_capacity_minutes') ?: 480,
            // Empty means "the default", stored as null so a later change to
            // the default reaches everyone who never chose their own days.
            //
            // Note the emptiness test is on the value, not $request->filled():
            // that reports an empty array as filled, because isEmptyString()
            // short-circuits on arrays before blank() ever sees it.
            'working_days' => self::workingDaysOrNull($request),
            'can_request' => $request->boolean('can_request', false),
        ]);

        $user->assignRole($request->role);

        ActivityLogger::logCreated($user, $request->user());

        return redirect()->route('users.index')
            ->with('success', 'User created successfully.');
    }

    public function edit(User $user): Response
    {
        $this->authorize('update', $user);

        $user->load('roles', 'department', 'team');

        return Inertia::render('Users/Edit', [
            'user' => $user,
            'roles' => Role::orderBy('name')->pluck('name'),
            'currentRole' => $user->roles->first()?->name,
            'departments' => Department::with('division')->orderBy('name')->get(['id', 'name', 'division_id']),
            'teams' => Team::orderBy('name')->get(['id', 'name', 'department_id']),
        ]);
    }

    public function update(UpdateUserRequest $request, User $user): RedirectResponse
    {
        $oldValues = $user->only(['name', 'email', 'position', 'department_id', 'team_id', 'is_active', 'can_create_rules', 'can_approve', 'can_request', 'can_create_project', 'daily_capacity_minutes', 'working_days']);

        $data = [
            'name' => $request->name,
            'email' => $request->email,
            'department_id' => $request->department_id,
            'team_id' => $request->team_id,
            'position' => $request->position,
            'is_active' => $request->boolean('is_active', true),
            'can_create_rules' => $request->boolean('can_create_rules', false),
            'can_approve' => $request->boolean('can_approve', false),
            'can_create_project' => $request->boolean('can_create_project', false),
            'daily_capacity_minutes' => $request->integer('daily_capacity_minutes') ?: 480,
            // Empty means "the default", stored as null so a later change to
            // the default reaches everyone who never chose their own days.
            //
            // Note the emptiness test is on the value, not $request->filled():
            // that reports an empty array as filled, because isEmptyString()
            // short-circuits on arrays before blank() ever sees it.
            'working_days' => self::workingDaysOrNull($request),
            'can_request' => $request->boolean('can_request', false),
        ];

        if ($request->filled('password')) {
            $data['password'] = $request->password;
        }

        $user->update($data);
        $user->syncRoles([$request->role]);

        ActivityLogger::logChanges($user, $oldValues, $request->user());

        return redirect()->route('users.index')
            ->with('success', 'User updated successfully.');
    }

    public function destroy(User $user): RedirectResponse
    {
        $this->authorize('delete', $user);

        ActivityLogger::logDeleted($user, auth()->user());

        $user->delete();

        return redirect()->route('users.index')
            ->with('success', 'User deleted successfully.');
    }

    /**
     * Normalise the working-days input to a list of ISO weekdays, or null when
     * none were chosen — null being "use the default".
     */
    private static function workingDaysOrNull(Request $request): ?array
    {
        $days = collect((array) $request->input('working_days', []))
            ->filter(fn ($d) => is_numeric($d))
            ->map(fn ($d) => (int) $d)
            ->filter(fn ($d) => $d >= 1 && $d <= 7)
            ->unique()->sort()->values()->all();

        return $days ?: null;
    }
}
