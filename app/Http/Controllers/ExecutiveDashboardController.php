<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Department;
use App\Models\Division;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskActivity;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ExecutiveDashboardController extends Controller
{
    private function authorizeAccess(Request $request): void
    {
        $user = $request->user();
        if (!$user->hasRole('admin') && !$user->hasRole('executive')) {
            abort(403);
        }
    }

    private function dateFilters(Request $request): array
    {
        $preset = $request->input('preset', 'all_time');
        $dateFrom = $request->input('date_from');
        $dateTo = $request->input('date_to');

        if ($preset !== 'custom') {
            $dateTo = now()->toDateString();
            $dateFrom = match ($preset) {
                'this_week' => now()->startOfWeek()->toDateString(),
                'this_month' => now()->startOfMonth()->toDateString(),
                'this_quarter' => now()->firstOfQuarter()->toDateString(),
                'this_year' => now()->startOfYear()->toDateString(),
                default => null,
            };
        }

        return [
            'preset' => $preset,
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
        ];
    }

    private function applyDateFilter($query, ?string $dateFrom, ?string $dateTo)
    {
        if ($dateFrom) {
            $query->where('created_at', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->where('created_at', '<=', $dateTo . ' 23:59:59');
        }

        return $query;
    }

    private function buildMetrics(Collection $userIds, ?string $dateFrom, ?string $dateTo): array
    {
        $taskQuery = Task::whereIn('assigned_to', $userIds);
        $this->applyDateFilter($taskQuery, $dateFrom, $dateTo);

        $totalTasks = (clone $taskQuery)->count();
        $completedTasks = (clone $taskQuery)->where('status', 'done')->count();
        $overdueTasks = Task::whereIn('assigned_to', $userIds)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->whereNotNull('due_date')
            ->where('due_date', '<', now())
            ->count();

        $projectIds = Task::whereIn('assigned_to', $userIds)->distinct()->pluck('project_id');
        $activeProjects = Project::whereIn('id', $projectIds)->where('status', 'active')->count();
        $totalProjects = Project::whereIn('id', $projectIds)->count();

        $completionRate = $totalTasks > 0 ? round(($completedTasks / $totalTasks) * 100) : 0;

        return [
            'totalTasks' => $totalTasks,
            'completedTasks' => $completedTasks,
            'overdueTasks' => $overdueTasks,
            'activeProjects' => $activeProjects,
            'totalProjects' => $totalProjects,
            'completionRate' => $completionRate,
        ];
    }

    private function activityTrend(Collection $userIds): array
    {
        return ActivityLog::whereIn('user_id', $userIds)
            ->where('created_at', '>=', now()->subDays(30))
            ->selectRaw('DATE(created_at) as date, COUNT(*) as count')
            ->groupBy('date')
            ->orderBy('date')
            ->pluck('count', 'date')
            ->toArray();
    }

    private function topContributors(Collection $userIds, int $limit = 10): array
    {
        return Task::whereIn('assigned_to', $userIds)
            ->where('status', 'done')
            ->select('assigned_to', DB::raw('COUNT(*) as completed_count'))
            ->groupBy('assigned_to')
            ->orderByDesc('completed_count')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => [
                'user_id' => $row->assigned_to,
                'name' => User::find($row->assigned_to)?->name ?? 'Unknown',
                'count' => $row->completed_count,
            ])
            ->toArray();
    }

    private function atRiskItems(Collection $userIds, int $limit = 10): array
    {
        return Task::with('project', 'assignee')
            ->whereIn('assigned_to', $userIds)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->whereNotNull('due_date')
            ->where('due_date', '<', now())
            ->orderBy('due_date')
            ->take($limit)
            ->get()
            ->map(fn ($t) => [
                'id' => $t->id,
                'title' => $t->title,
                'due_date' => $t->due_date->toDateString(),
                'priority' => $t->priority,
                'status' => $t->status,
                'assignee' => $t->assignee ? ['id' => $t->assignee->id, 'name' => $t->assignee->name] : null,
                'project' => $t->project ? ['id' => $t->project->id, 'name' => $t->project->name] : null,
            ])
            ->toArray();
    }

    private function workloadDistribution(Collection $userIds): array
    {
        return User::whereIn('id', $userIds)
            ->where('is_active', true)
            ->select('id', 'name')
            ->withCount(['assignedTasks as active_tasks_count' => fn ($q) => $q->whereNotIn('status', ['done', 'cancelled'])])
            ->having('active_tasks_count', '>', 0)
            ->orderByDesc('active_tasks_count')
            ->take(15)
            ->get()
            ->toArray();
    }

    private function distributions(Collection $userIds): array
    {
        return [
            'byStatus' => Task::whereIn('assigned_to', $userIds)
                ->selectRaw('status, COUNT(*) as count')
                ->groupBy('status')
                ->pluck('count', 'status'),
            'byPriority' => Task::whereIn('assigned_to', $userIds)
                ->selectRaw('priority, COUNT(*) as count')
                ->groupBy('priority')
                ->pluck('count', 'priority'),
        ];
    }

    private function getUserIdsForDivision(Division $division): Collection
    {
        $deptIds = $division->departments()->pluck('id');

        return User::whereIn('department_id', $deptIds)->where('is_active', true)->pluck('id');
    }

    /**
     * Rank org units (teams or departments) with a size-fair composite score:
     * 40% completion rate + 30% on-time delivery + 30% completed-per-member
     * (normalized to the best unit). Cancelled tasks are excluded from totals.
     */
    private function rankUnits(Collection $units, string $groupColumn): Collection
    {
        if ($units->isEmpty()) {
            return collect();
        }

        $stats = Task::query()
            ->join('users', 'tasks.assigned_to', '=', 'users.id')
            ->whereNotNull("users.{$groupColumn}")
            ->groupBy("users.{$groupColumn}")
            ->selectRaw("users.{$groupColumn} as unit_id")
            ->selectRaw("SUM(tasks.status != 'cancelled') as total_tasks")
            ->selectRaw("SUM(tasks.status = 'done') as completed_tasks")
            ->selectRaw("SUM(tasks.status = 'done' AND tasks.due_date IS NOT NULL) as completed_with_due")
            ->selectRaw("SUM(tasks.status = 'done' AND tasks.due_date IS NOT NULL AND tasks.completed_at IS NOT NULL AND DATE(tasks.completed_at) <= tasks.due_date) as on_time_tasks")
            ->selectRaw("SUM(tasks.status NOT IN ('done', 'cancelled') AND tasks.due_date IS NOT NULL AND tasks.due_date < CURDATE()) as overdue_tasks")
            ->get()
            ->keyBy('unit_id');

        $ranked = $units->map(function ($unit) use ($stats) {
            $s = $stats->get($unit->id);
            $total = (int) ($s->total_tasks ?? 0);
            $completed = (int) ($s->completed_tasks ?? 0);
            $completedWithDue = (int) ($s->completed_with_due ?? 0);
            $onTime = (int) ($s->on_time_tasks ?? 0);
            $members = max((int) $unit->members_count, 1);

            $completionRate = $total > 0 ? $completed / $total : 0;
            // Units with no due-dated completions get full on-time credit if
            // they completed anything — no due dates means nothing was late.
            $onTimeRate = $completedWithDue > 0
                ? $onTime / $completedWithDue
                : ($completed > 0 ? 1.0 : 0);

            return [
                'id' => $unit->id,
                'name' => $unit->name,
                'department' => $unit->relationLoaded('department') ? $unit->department?->name : null,
                'division' => $unit->relationLoaded('division') ? $unit->division?->name : null,
                'members_count' => (int) $unit->members_count,
                'total_tasks' => $total,
                'completed_tasks' => $completed,
                'overdue_tasks' => (int) ($s->overdue_tasks ?? 0),
                'completion_rate' => round($completionRate * 100),
                'on_time_rate' => round($onTimeRate * 100),
                'throughput' => $completed / $members,
            ];
        })->filter(fn ($unit) => $unit['total_tasks'] > 0);

        $maxThroughput = max($ranked->max('throughput') ?? 0, 0.0001);

        return $ranked
            ->map(function ($unit) use ($maxThroughput) {
                $unit['score'] = round(
                    ($unit['completion_rate'] / 100) * 40
                    + ($unit['on_time_rate'] / 100) * 30
                    + ($unit['throughput'] / $maxThroughput) * 30,
                    1
                );
                unset($unit['throughput']);

                return $unit;
            })
            ->sortBy([['score', 'desc'], ['completed_tasks', 'desc']])
            ->take(5)
            ->values();
    }

    public function index(Request $request): Response
    {
        $this->authorizeAccess($request);
        $filters = $this->dateFilters($request);

        $allActiveUserIds = User::where('is_active', true)->pluck('id');
        $metrics = $this->buildMetrics($allActiveUserIds, $filters['date_from'], $filters['date_to']);

        $divisions = Division::with('head')
            ->withCount('departments')
            ->get()
            ->map(function ($div) {
                $deptIds = $div->departments()->pluck('id');
                $userIds = User::whereIn('department_id', $deptIds)->where('is_active', true)->pluck('id');
                $teamCount = Team::whereIn('department_id', $deptIds)->count();
                $totalTasks = Task::whereIn('assigned_to', $userIds)->count();
                $completedTasks = Task::whereIn('assigned_to', $userIds)->where('status', 'done')->count();
                $activeProjects = Project::whereIn('id',
                    Task::whereIn('assigned_to', $userIds)->distinct()->pluck('project_id')
                )->where('status', 'active')->count();

                return [
                    'id' => $div->id,
                    'name' => $div->name,
                    'head' => $div->head ? ['id' => $div->head->id, 'name' => $div->head->name] : null,
                    'departments_count' => $div->departments_count,
                    'teams_count' => $teamCount,
                    'members_count' => $userIds->count(),
                    'completion_rate' => $totalTasks > 0 ? round(($completedTasks / $totalTasks) * 100) : 0,
                    'active_projects' => $activeProjects,
                ];
            });

        return Inertia::render('ExecutiveDashboard/Index', [
            'level' => 'overview',
            'metrics' => $metrics,
            'divisions' => $divisions,
            'activityTrend' => $this->activityTrend($allActiveUserIds),
            'topContributors' => $this->topContributors($allActiveUserIds),
            'topTeams' => $this->rankUnits(
                Team::with('department:id,name')
                    ->withCount(['members' => fn ($q) => $q->where('is_active', true)])
                    ->get(),
                'team_id'
            ),
            'topDepartments' => $this->rankUnits(
                Department::with('division:id,name')
                    ->withCount(['users as members_count' => fn ($q) => $q->where('is_active', true)])
                    ->get(),
                'department_id'
            ),
            'atRiskItems' => $this->atRiskItems($allActiveUserIds),
            'filters' => $filters,
        ]);
    }

    public function division(Request $request, Division $division): Response
    {
        $this->authorizeAccess($request);
        $filters = $this->dateFilters($request);
        $division->load('head');

        $userIds = $this->getUserIdsForDivision($division);
        $metrics = $this->buildMetrics($userIds, $filters['date_from'], $filters['date_to']);

        $departments = Department::where('division_id', $division->id)
            ->with('head')
            ->withCount('teams')
            ->get()
            ->map(function ($dept) {
                $deptUserIds = User::where('department_id', $dept->id)->where('is_active', true)->pluck('id');
                $totalTasks = Task::whereIn('assigned_to', $deptUserIds)->count();
                $completedTasks = Task::whereIn('assigned_to', $deptUserIds)->where('status', 'done')->count();

                return [
                    'id' => $dept->id,
                    'name' => $dept->name,
                    'head' => $dept->head ? ['id' => $dept->head->id, 'name' => $dept->head->name] : null,
                    'teams_count' => $dept->teams_count,
                    'members_count' => $deptUserIds->count(),
                    'total_tasks' => $totalTasks,
                    'completed_tasks' => $completedTasks,
                    'completion_rate' => $totalTasks > 0 ? round(($completedTasks / $totalTasks) * 100) : 0,
                ];
            });

        return Inertia::render('ExecutiveDashboard/Index', [
            'level' => 'division',
            'entity' => [
                'id' => $division->id,
                'name' => $division->name,
                'head' => $division->head ? ['id' => $division->head->id, 'name' => $division->head->name] : null,
            ],
            'metrics' => $metrics,
            'units' => $departments,
            'activityTrend' => $this->activityTrend($userIds),
            'workload' => $this->workloadDistribution($userIds),
            'atRiskItems' => $this->atRiskItems($userIds),
            'filters' => $filters,
            'breadcrumbs' => [
                ['label' => 'Executive Dashboard', 'href' => route('executive-dashboard')],
                ['label' => $division->name],
            ],
        ]);
    }

    public function department(Request $request, Department $department): Response
    {
        $this->authorizeAccess($request);
        $filters = $this->dateFilters($request);
        $department->load('division', 'head');

        $userIds = User::where('department_id', $department->id)->where('is_active', true)->pluck('id');
        $metrics = $this->buildMetrics($userIds, $filters['date_from'], $filters['date_to']);

        $teams = Team::where('department_id', $department->id)
            ->with('leader')
            ->get()
            ->map(function ($team) {
                $teamUserIds = User::where('team_id', $team->id)->where('is_active', true)->pluck('id');
                $totalTasks = Task::whereIn('assigned_to', $teamUserIds)->count();
                $completedTasks = Task::whereIn('assigned_to', $teamUserIds)->where('status', 'done')->count();

                return [
                    'id' => $team->id,
                    'name' => $team->name,
                    'leader' => $team->leader ? ['id' => $team->leader->id, 'name' => $team->leader->name] : null,
                    'members_count' => $teamUserIds->count(),
                    'total_tasks' => $totalTasks,
                    'completed_tasks' => $completedTasks,
                    'completion_rate' => $totalTasks > 0 ? round(($completedTasks / $totalTasks) * 100) : 0,
                ];
            });

        return Inertia::render('ExecutiveDashboard/Index', [
            'level' => 'department',
            'entity' => [
                'id' => $department->id,
                'name' => $department->name,
                'head' => $department->head ? ['id' => $department->head->id, 'name' => $department->head->name] : null,
            ],
            'metrics' => $metrics,
            'units' => $teams,
            'activityTrend' => $this->activityTrend($userIds),
            'workload' => $this->workloadDistribution($userIds),
            'atRiskItems' => $this->atRiskItems($userIds),
            'filters' => $filters,
            'breadcrumbs' => [
                ['label' => 'Executive Dashboard', 'href' => route('executive-dashboard')],
                ['label' => $department->division->name, 'href' => route('executive-dashboard.division', $department->division)],
                ['label' => $department->name],
            ],
        ]);
    }

    public function team(Request $request, Team $team): Response
    {
        $this->authorizeAccess($request);
        $filters = $this->dateFilters($request);
        $team->load('department.division', 'leader');

        $userIds = User::where('team_id', $team->id)->where('is_active', true)->pluck('id');
        $metrics = $this->buildMetrics($userIds, $filters['date_from'], $filters['date_to']);

        $members = User::whereIn('id', $userIds)
            ->select('id', 'name', 'position')
            ->withCount([
                'assignedTasks',
                'assignedTasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done'),
                'assignedTasks as overdue_tasks_count' => fn ($q) => $q
                    ->whereNotIn('status', ['done', 'cancelled'])
                    ->whereNotNull('due_date')
                    ->where('due_date', '<', now()),
                'assignedTasks as active_tasks_count' => fn ($q) => $q
                    ->whereNotIn('status', ['done', 'cancelled']),
            ])
            ->get()
            ->map(fn ($u) => [
                'id' => $u->id,
                'name' => $u->name,
                'position' => $u->position,
                'assigned_tasks_count' => $u->assigned_tasks_count,
                'completed_tasks_count' => $u->completed_tasks_count,
                'overdue_tasks_count' => $u->overdue_tasks_count,
                'active_tasks_count' => $u->active_tasks_count,
                'completion_rate' => $u->assigned_tasks_count > 0
                    ? round(($u->completed_tasks_count / $u->assigned_tasks_count) * 100)
                    : 0,
            ]);

        $recentActivity = TaskActivity::with(['task.project', 'user'])
            ->whereHas('task', fn ($q) => $q->whereIn('assigned_to', $userIds))
            ->orderBy('created_at', 'desc')
            ->take(15)
            ->get()
            ->map(fn ($a) => [
                'id' => $a->id,
                'description' => $a->description,
                'field' => $a->field,
                'old_value' => $a->old_value,
                'new_value' => $a->new_value,
                'user' => $a->user ? ['id' => $a->user->id, 'name' => $a->user->name] : null,
                'task' => $a->task ? [
                    'id' => $a->task->id,
                    'title' => $a->task->title,
                    'project_id' => $a->task->project_id,
                    'project_name' => $a->task->project?->name,
                ] : null,
                'created_at' => $a->created_at->toIso8601String(),
            ]);

        $distributions = $this->distributions($userIds);

        return Inertia::render('ExecutiveDashboard/Index', [
            'level' => 'team',
            'entity' => [
                'id' => $team->id,
                'name' => $team->name,
                'leader' => $team->leader ? ['id' => $team->leader->id, 'name' => $team->leader->name] : null,
            ],
            'metrics' => $metrics,
            'members' => $members,
            'distributions' => $distributions,
            'activityFeed' => $recentActivity,
            'filters' => $filters,
            'breadcrumbs' => [
                ['label' => 'Executive Dashboard', 'href' => route('executive-dashboard')],
                ['label' => $team->department->division->name, 'href' => route('executive-dashboard.division', $team->department->division)],
                ['label' => $team->department->name, 'href' => route('executive-dashboard.department', $team->department)],
                ['label' => $team->name],
            ],
        ]);
    }
}
