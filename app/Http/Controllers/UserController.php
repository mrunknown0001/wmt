<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Models\Department;
use App\Models\Task;
use App\Models\TaskDelegation;
use App\Models\Team;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\OrgScope;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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
            // Executives can see this list but the cover page has its own
            // authority rule, so the action only appears for people it will
            // actually let in.
            'canArrangeCover' => OrgScope::hasAnyScope($request->user()),
        ]);
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
        $overdue = (clone $tasks)->whereNotIn('status', ['done', 'cancelled'])
            ->whereNotNull('due_date')->where('due_date', '<', now())->count();

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
     * What this person has coming up, for the rest of the week and the month.
     *
     * Unfinished work only, from today forward — anything already past its due
     * date is not "upcoming", and the overdue KPI above already reports it.
     *
     * The two buckets overlap on purpose: the month is a superset of the week,
     * so the page offers them as a toggle over one list rather than two lists
     * that would show the same task twice. The counts come from their own
     * queries so the badges stay right even when the list is capped.
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

        $base = fn () => Task::query()
            ->where('assigned_to', $user->id)
            ->whereNotIn('status', Task::CLOSING_STATUSES)
            ->whereNotNull('due_date')
            ->whereDate('due_date', '>=', $today->toDateString());

        $tasks = $base()->with('project:id,name')
            ->whereDate('due_date', '<=', $rangeEnd->toDateString())
            ->orderBy('due_date')
            ->orderByRaw('due_time is null, due_time')
            ->limit(self::UPCOMING_LIMIT)
            ->get(['id', 'project_id', 'title', 'status', 'priority', 'due_date', 'due_time']);

        return [
            'tasks' => $tasks->map(fn (Task $t) => [
                'id' => $t->id,
                'title' => $t->title,
                'status' => $t->status,
                'priority' => $t->priority,
                'due_date' => $t->due_date?->toDateString(),
                'due_time' => $t->due_time,
                'url' => $t->getEditUrl(),
                'project' => $t->project ? ['id' => $t->project->id, 'name' => $t->project->name] : null,
                'in_week' => $t->due_date && $t->due_date->startOfDay()->lessThanOrEqualTo($weekEnd),
                'in_month' => $t->due_date && $t->due_date->startOfDay()->lessThanOrEqualTo($monthEnd),
            ])->values()->all(),
            'weekCount' => $base()->whereDate('due_date', '<=', $weekEnd->toDateString())->count(),
            'monthCount' => $base()->whereDate('due_date', '<=', $monthEnd->toDateString())->count(),
            'weekEnds' => $weekEnd->toDateString(),
            'monthEnds' => $monthEnd->toDateString(),
            'limit' => self::UPCOMING_LIMIT,
        ];
    }

    /** Enough to be useful on an overview without turning it into a task list. */
    private const UPCOMING_LIMIT = 50;

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
