<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskActivity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();

        $myProjects = Project::with('owner:id,name')
            ->where('owner_id', $user->id)
            ->where('status', '!=', 'archived')
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')])
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get();

        $involvedProjectIds = Task::where('assigned_to', $user->id)
            ->whereNotNull('project_id')
            ->distinct()
            ->pluck('project_id')
            ->merge($user->memberProjects()->pluck('projects.id'))
            ->unique()
            ->diff($myProjects->pluck('id'));

        $involvedProjects = $involvedProjectIds->isNotEmpty()
            ? Project::with('owner:id,name')
                ->whereIn('id', $involvedProjectIds)
                ->where('status', '!=', 'archived')
                ->withCount('tasks')
                ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')])
                ->orderBy('updated_at', 'desc')
                ->take(5)
                ->get()
            : collect();

        $myRecentTasks = Task::with('project:id,name')
            ->where('assigned_to', $user->id)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->orderBy('due_date')
            ->take(5)
            ->get();

        $activityFeed = TaskActivity::with(['task:id,title,project_id', 'task.project:id,name', 'user:id,name'])
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

        return response()->json([
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
                'completedThisWeek' => Task::where('assigned_to', $user->id)
                    ->where('status', 'done')
                    ->where('updated_at', '>=', now()->startOfWeek())
                    ->count(),
                'dueToday' => Task::where('assigned_to', $user->id)
                    ->whereNotIn('status', ['done', 'cancelled'])
                    ->whereDate('due_date', today())
                    ->count(),
            ],
            'myProjects' => $myProjects,
            'involvedProjects' => $involvedProjects,
            'myRecentTasks' => $myRecentTasks,
            'activityFeed' => $activityFeed,
        ]);
    }
}
