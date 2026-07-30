<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Models\Department;
use App\Models\Team;
use App\Models\User;
use App\Services\ActivityLogger;
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
        ]);
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
            'canManage' => $request->user()->can('manage-users'),
        ]);
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

        // Head of the target's department.
        if ($target->department_id && Department::where('id', $target->department_id)->where('head_id', $viewer->id)->exists()) {
            return true;
        }

        // Head of the division the target's department belongs to.
        if ($target->department_id) {
            $divisionId = Department::where('id', $target->department_id)->value('division_id');
            if ($divisionId && \App\Models\Division::where('id', $divisionId)->where('head_id', $viewer->id)->exists()) {
                return true;
            }
        }

        return false;
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
        $oldValues = $user->only(['name', 'email', 'position', 'department_id', 'team_id', 'is_active', 'can_create_rules', 'can_approve', 'can_request', 'can_create_project']);

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
}
