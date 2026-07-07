<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class MyTaskController extends Controller
{
    public function index(Request $request): Response
    {
        $user = auth()->user();
        $today = now()->startOfDay();

        $status = $request->query('status', '');
        $priority = $request->query('priority', '');
        $search = $request->query('search', '');

        $query = Task::with('project', 'parent:id,title')
            ->where('assigned_to', $user->id);

        if ($search) {
            $query->where('title', 'like', "%{$search}%");
        }
        if ($status) {
            $query->where('status', $status);
        }
        if ($priority) {
            $query->where('priority', $priority);
        }

        $query->orderByRaw('CASE WHEN due_date IS NULL THEN 1 ELSE 0 END')
            ->orderBy('due_date')
            ->orderBy('priority', 'desc');

        $isCompletedFilter = in_array($status, ['done', 'cancelled']);

        // When no status filter, exclude done/cancelled (show active tasks)
        if (!$status) {
            $query->whereNotIn('status', ['done', 'cancelled']);
        }

        $paginated = $query->paginate(20)->withQueryString();
        $tasks = collect($paginated->items());

        if ($isCompletedFilter) {
            // Group by completion timeliness
            $grouped = [
                'completedOnTime' => $tasks->filter(function ($t) {
                    if (!$t->due_date) return true;
                    if (!$t->completed_at) return true;
                    return $t->completed_at->lte($t->due_date->endOfDay());
                })->values(),
                'completedLate' => $tasks->filter(function ($t) {
                    if (!$t->due_date) return false;
                    if (!$t->completed_at) return false;
                    return $t->completed_at->gt($t->due_date->endOfDay());
                })->values(),
            ];
        } else {
            // Group by due date urgency
            $grouped = [
                'overdue' => $tasks->filter(fn ($t) => $t->due_date && $t->due_date->lt($today))->values(),
                'dueToday' => $tasks->filter(fn ($t) => $t->due_date && $t->due_date->eq($today))->values(),
                'upcoming' => $tasks->filter(fn ($t) => $t->due_date && $t->due_date->gt($today) && $t->due_date->lte($today->copy()->addDays(7)))->values(),
                'later' => $tasks->filter(fn ($t) => $t->due_date && $t->due_date->gt($today->copy()->addDays(7)))->values(),
                'noDueDate' => $tasks->filter(fn ($t) => !$t->due_date)->values(),
            ];
        }

        // Stats — count from unfiltered active tasks for context
        $statsQuery = Task::where('assigned_to', $user->id)
            ->whereNotIn('status', ['done', 'cancelled']);

        $totalActive = $statsQuery->count();
        $overdueCount = (clone $statsQuery)->whereNotNull('due_date')->where('due_date', '<', $today)->count();
        $dueTodayCount = (clone $statsQuery)->where('due_date', $today)->count();

        $canAssignOthers = $user->hasPermissionTo('manage-tasks')
            || $user->hasAnyRole(['supervisor', 'division_head', 'executive', 'admin']);

        return Inertia::render('MyTasks/Index', [
            'taskGroups' => $grouped,
            'isCompletedFilter' => $isCompletedFilter,
            'pagination' => [
                'links' => $paginated->linkCollection()->toArray(),
                'total' => $paginated->total(),
                'from' => $paginated->firstItem(),
                'to' => $paginated->lastItem(),
            ],
            'stats' => [
                'total' => $totalActive,
                'overdue' => $overdueCount,
                'dueToday' => $dueTodayCount,
            ],
            'filters' => [
                'status' => $status,
                'priority' => $priority,
                'search' => $search,
            ],
            'canAssignOthers' => $canAssignOthers,
            'users' => $canAssignOthers
                ? User::where('is_active', true)->orderBy('name')->get(['id', 'name'])
                : [],
            'projects' => Project::where('status', '!=', 'archived')
                ->orderBy('name')
                ->get(['id', 'name']),
            'statuses' => ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'],
            'priorities' => ['low', 'medium', 'high', 'urgent'],
        ]);
    }
}
