<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Department;
use App\Models\Division;
use App\Models\Project;
use App\Models\Task;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ExecutiveDashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user->hasRole('admin') && !$user->hasRole('supervisor') && !$user->hasRole('division_head') && !$user->hasRole('executive')) {
            abort(403);
        }

        $divisionId = $request->input('division_id');
        $departmentId = $request->input('department_id');
        $teamId = $request->input('team_id');

        // Drill-down: team level
        if ($teamId) {
            return $this->teamData($teamId);
        }

        // Drill-down: department level
        if ($departmentId) {
            return $this->departmentData($departmentId);
        }

        // Drill-down: division level
        if ($divisionId) {
            return $this->divisionData($divisionId);
        }

        // Overview
        return $this->overviewData();
    }

    private function overviewData(): JsonResponse
    {
        $allActiveUserIds = User::where('is_active', true)->pluck('id');
        $metrics = $this->buildMetrics($allActiveUserIds);

        $divisions = Division::with('head')
            ->withCount('departments')
            ->get()
            ->map(function ($div) {
                $deptIds = $div->departments()->pluck('id');
                $userIds = User::whereIn('department_id', $deptIds)->where('is_active', true)->pluck('id');
                $totalTasks = Task::whereIn('assigned_to', $userIds)->count();
                $completedTasks = Task::whereIn('assigned_to', $userIds)->where('status', 'done')->count();

                return [
                    'id' => $div->id,
                    'name' => $div->name,
                    'head' => $div->head ? ['id' => $div->head->id, 'name' => $div->head->name] : null,
                    'departments_count' => $div->departments_count,
                    'members_count' => $userIds->count(),
                    'completion_rate' => $totalTasks > 0 ? round(($completedTasks / $totalTasks) * 100) : 0,
                ];
            });

        return response()->json([
            'level' => 'overview',
            'metrics' => $metrics,
            'divisions' => $divisions,
            'activity_trend' => $this->activityTrend($allActiveUserIds),
            'top_contributors' => $this->topContributors($allActiveUserIds),
            'at_risk_items' => $this->atRiskItems($allActiveUserIds),
        ]);
    }

    private function divisionData(int $divisionId): JsonResponse
    {
        $division = Division::with('head')->findOrFail($divisionId);
        $deptIds = $division->departments()->pluck('id');
        $userIds = User::whereIn('department_id', $deptIds)->where('is_active', true)->pluck('id');
        $metrics = $this->buildMetrics($userIds);

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

        return response()->json([
            'level' => 'division',
            'entity' => [
                'id' => $division->id,
                'name' => $division->name,
                'head' => $division->head ? ['id' => $division->head->id, 'name' => $division->head->name] : null,
            ],
            'metrics' => $metrics,
            'departments' => $departments,
            'activity_trend' => $this->activityTrend($userIds),
            'at_risk_items' => $this->atRiskItems($userIds),
        ]);
    }

    private function departmentData(int $departmentId): JsonResponse
    {
        $department = Department::with('head')->findOrFail($departmentId);
        $userIds = User::where('department_id', $department->id)->where('is_active', true)->pluck('id');
        $metrics = $this->buildMetrics($userIds);

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

        return response()->json([
            'level' => 'department',
            'entity' => [
                'id' => $department->id,
                'name' => $department->name,
                'head' => $department->head ? ['id' => $department->head->id, 'name' => $department->head->name] : null,
            ],
            'metrics' => $metrics,
            'teams' => $teams,
            'activity_trend' => $this->activityTrend($userIds),
            'at_risk_items' => $this->atRiskItems($userIds),
        ]);
    }

    private function teamData(int $teamId): JsonResponse
    {
        $team = Team::with('leader')->findOrFail($teamId);
        $userIds = User::where('team_id', $team->id)->where('is_active', true)->pluck('id');
        $metrics = $this->buildMetrics($userIds);

        $members = User::whereIn('id', $userIds)
            ->select('id', 'name', 'position')
            ->withCount([
                'assignedTasks',
                'assignedTasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done'),
                'assignedTasks as active_tasks_count' => fn ($q) => $q->whereNotIn('status', ['done', 'cancelled']),
            ])
            ->get()
            ->map(fn ($u) => [
                'id' => $u->id,
                'name' => $u->name,
                'position' => $u->position,
                'assigned_tasks_count' => $u->assigned_tasks_count,
                'completed_tasks_count' => $u->completed_tasks_count,
                'active_tasks_count' => $u->active_tasks_count,
                'completion_rate' => $u->assigned_tasks_count > 0
                    ? round(($u->completed_tasks_count / $u->assigned_tasks_count) * 100)
                    : 0,
            ]);

        return response()->json([
            'level' => 'team',
            'entity' => [
                'id' => $team->id,
                'name' => $team->name,
                'leader' => $team->leader ? ['id' => $team->leader->id, 'name' => $team->leader->name] : null,
            ],
            'metrics' => $metrics,
            'members' => $members,
            'activity_trend' => $this->activityTrend($userIds),
            'at_risk_items' => $this->atRiskItems($userIds),
        ]);
    }

    private function buildMetrics(Collection $userIds): array
    {
        $totalTasks = Task::whereIn('assigned_to', $userIds)->count();
        $completedTasks = Task::whereIn('assigned_to', $userIds)->where('status', 'done')->count();
        $overdueTasks = Task::whereIn('assigned_to', $userIds)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->whereNotNull('due_date')
            ->where('due_date', '<', now())
            ->count();

        $projectIds = Task::whereIn('assigned_to', $userIds)->distinct()->pluck('project_id');
        $activeProjects = Project::whereIn('id', $projectIds)->where('status', 'active')->count();
        $totalProjects = Project::whereIn('id', $projectIds)->count();

        return [
            'totalTasks' => $totalTasks,
            'completedTasks' => $completedTasks,
            'overdueTasks' => $overdueTasks,
            'activeProjects' => $activeProjects,
            'totalProjects' => $totalProjects,
            'completionRate' => $totalTasks > 0 ? round(($completedTasks / $totalTasks) * 100) : 0,
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
        return Task::with('project:id,name', 'assignee:id,name')
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
}
