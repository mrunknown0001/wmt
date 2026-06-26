<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskActivity;
use App\Models\User;
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
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')])
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get();

        // Projects where the user is assigned tasks or is a member, but not the owner
        $involvedProjectIds = Task::where('assigned_to', $user->id)
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
            $data['charts'] = [
                'tasksByStatus' => Task::selectRaw('status, count(*) as count')
                    ->groupBy('status')
                    ->pluck('count', 'status'),
                'tasksByPriority' => Task::selectRaw('priority, count(*) as count')
                    ->groupBy('priority')
                    ->pluck('count', 'priority'),
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
}
