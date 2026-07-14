<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskActivity;
use App\Models\Team;
use App\Models\User;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(): Response
    {
        $user = auth()->user();
        $prefs = $user->getDashboardPreferences();

        // --- Always present ---
        $myProjects = Project::with('owner')
            ->where('owner_id', $user->id)
            ->where('status', '!=', 'archived')
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')])
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get();

        $archivedProjects = Project::with('owner')
            ->where('owner_id', $user->id)
            ->where('status', 'archived')
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')])
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get();

        // Projects where the user is assigned tasks or is a member, but not the owner
        $involvedProjectIds = Task::where('assigned_to', $user->id)
            ->whereNotNull('project_id')
            ->distinct()
            ->pluck('project_id')
            ->merge(
                $user->memberProjects()->pluck('projects.id')
            )
            ->unique()
            ->diff($myProjects->pluck('id'));

        $involvedProjects = $involvedProjectIds->isNotEmpty()
            ? Project::with('owner')
                ->whereIn('id', $involvedProjectIds)
                ->where('status', '!=', 'archived')
                ->withCount('tasks')
                ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')])
                ->orderBy('updated_at', 'desc')
                ->take(5)
                ->get()
            : collect();

        $myRecentTasks = Task::with('project')
            ->where('assigned_to', $user->id)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->orderBy('due_date')
            ->take(5)
            ->get();

        $data = [
            'stats' => [
                'myProjects' => Project::where('owner_id', $user->id)->count(),
                'activeProjects' => Project::where('owner_id', $user->id)->where('status', 'active')->count(),
                'myTasks' => Task::where('assigned_to', $user->id)
                    ->whereNotIn('status', ['done', 'cancelled'])
                    ->count(),
                'overdueTasks' => Task::where('assigned_to', $user->id)
                    ->whereNotNull('due_date')
                    ->where('due_date', '<', now())
                    ->whereNotIn('status', ['done', 'cancelled'])
                    ->count(),
            ],
            'myProjects' => $myProjects,
            'archivedProjects' => $archivedProjects,
            'involvedProjects' => $involvedProjects,
            'myRecentTasks' => $myRecentTasks,
            'dashboardPreferences' => $prefs,
        ];

        // Task Stats
        if ($prefs['showTaskStats']) {
            $data['taskStats'] = [
                'completedThisWeek' => Task::where('assigned_to', $user->id)
                    ->where('status', 'done')
                    ->where('updated_at', '>=', now()->startOfWeek())
                    ->count(),
                'dueToday' => Task::where('assigned_to', $user->id)
                    ->whereNotIn('status', ['done', 'cancelled'])
                    ->whereDate('due_date', today())
                    ->count(),
                'byStatus' => Task::where('assigned_to', $user->id)
                    ->selectRaw('status, count(*) as count')
                    ->groupBy('status')
                    ->pluck('count', 'status'),
            ];
        }

        // Activity Feed
        if ($prefs['showActivityFeed']) {
            $data['activityFeed'] = TaskActivity::with(['task.project', 'user'])
                ->whereHas('task', fn ($q) => $q->where('assigned_to', $user->id))
                ->orderBy('created_at', 'desc')
                ->take(10)
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
        }

        // Charts
        if ($prefs['showCharts']) {
            $weeks = collect(range(7, 0))->map(fn ($i) => now()->startOfWeek()->subWeeks($i));
            $trendStart = $weeks->first();

            $createdByWeek = Task::where('created_at', '>=', $trendStart)
                ->selectRaw('YEARWEEK(created_at, 3) as yearweek, count(*) as count')
                ->groupBy('yearweek')
                ->pluck('count', 'yearweek');

            $completedByWeek = Task::where('status', 'done')
                ->whereNotNull('completed_at')
                ->where('completed_at', '>=', $trendStart)
                ->selectRaw('YEARWEEK(completed_at, 3) as yearweek, count(*) as count')
                ->groupBy('yearweek')
                ->pluck('count', 'yearweek');

            $data['charts'] = [
                'tasksByStatus' => Task::selectRaw('status, count(*) as count')
                    ->groupBy('status')
                    ->pluck('count', 'status'),
                'tasksByPriority' => Task::selectRaw('priority, count(*) as count')
                    ->groupBy('priority')
                    ->pluck('count', 'priority'),
                'completionTrend' => $weeks->map(fn ($week) => [
                    'label' => $week->format('M j'),
                    'created' => (int) ($createdByWeek[$week->format('oW')] ?? 0),
                    'completed' => (int) ($completedByWeek[$week->format('oW')] ?? 0),
                ])->values(),
            ];
        }

        // Due Today / Overdue
        if ($prefs['showDueToday']) {
            $data['urgentItems'] = Task::with('project')
                ->where('assigned_to', $user->id)
                ->whereNotIn('status', ['done', 'cancelled'])
                ->where(function ($q) {
                    $q->where(function ($sub) {
                        $sub->whereNotNull('due_date')->where('due_date', '<', now());
                    })->orWhereDate('due_date', today());
                })
                ->orderBy('due_date')
                ->take(10)
                ->get();
        }

        // Top 5 Teams & Departments leaderboard (executive only)
        if ($prefs['showTopPerformers'] && $user->hasRole('executive')) {
            $data['topTeams'] = $this->rankUnits(
                Team::with('department:id,name')
                    ->withCount(['members' => fn ($q) => $q->where('is_active', true)])
                    ->get(),
                'team_id'
            );

            $data['topDepartments'] = $this->rankUnits(
                Department::with('division:id,name')
                    ->withCount(['users as members_count' => fn ($q) => $q->where('is_active', true)])
                    ->get(),
                'department_id'
            );
        }

        // Team Workload (admin/supervisor only)
        if ($prefs['showTeamWorkload'] && ($user->hasRole('admin') || $user->hasRole('supervisor'))) {
            $data['teamWorkload'] = User::select('id', 'name')
                ->where('is_active', true)
                ->withCount(['assignedTasks' => fn ($q) => $q->whereNotIn('status', ['done', 'cancelled'])])
                ->having('assigned_tasks_count', '>', 0)
                ->orderByDesc('assigned_tasks_count')
                ->take(10)
                ->get();
        }

        return Inertia::render('Dashboard', $data);
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
}
