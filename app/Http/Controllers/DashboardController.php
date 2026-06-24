<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(): Response
    {
        $user = auth()->user();

        $recentProjects = Project::with('owner')
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')])
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get();

        $myRecentTasks = Task::with('project')
            ->where('assigned_to', $user->id)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->orderBy('due_date')
            ->take(5)
            ->get();

        return Inertia::render('Dashboard', [
            'stats' => [
                'totalProjects' => Project::count(),
                'activeProjects' => Project::where('status', 'active')->count(),
                'myTasks' => Task::where('assigned_to', $user->id)
                    ->whereNotIn('status', ['done', 'cancelled'])
                    ->count(),
                'overdueTasks' => Task::where('assigned_to', $user->id)
                    ->whereNotNull('due_date')
                    ->where('due_date', '<', now())
                    ->whereNotIn('status', ['done', 'cancelled'])
                    ->count(),
            ],
            'recentProjects' => $recentProjects,
            'myRecentTasks' => $myRecentTasks,
        ]);
    }
}
