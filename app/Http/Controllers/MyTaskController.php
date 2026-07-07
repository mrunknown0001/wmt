<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Inertia\Inertia;
use Inertia\Response;

class MyTaskController extends Controller
{
    public function index(): Response
    {
        $user = auth()->user();
        $today = now()->startOfDay();

        $allTasks = Task::with('project', 'parent:id,title')
            ->where('assigned_to', $user->id)
            ->orderByRaw('CASE WHEN due_date IS NULL THEN 1 ELSE 0 END')
            ->orderBy('due_date')
            ->orderBy('priority', 'desc')
            ->get();

        $activeTasks = $allTasks->whereNotIn('status', ['done', 'cancelled']);

        $grouped = [
            'overdue' => $activeTasks->filter(fn ($t) => $t->due_date && $t->due_date->lt($today)),
            'dueToday' => $activeTasks->filter(fn ($t) => $t->due_date && $t->due_date->eq($today)),
            'upcoming' => $activeTasks->filter(fn ($t) => $t->due_date && $t->due_date->gt($today) && $t->due_date->lte($today->copy()->addDays(7))),
            'later' => $activeTasks->filter(fn ($t) => $t->due_date && $t->due_date->gt($today->copy()->addDays(7))),
            'noDueDate' => $activeTasks->filter(fn ($t) => !$t->due_date),
        ];

        $canAssignOthers = $user->hasPermissionTo('manage-tasks')
            || $user->hasAnyRole(['supervisor', 'division_head', 'executive', 'admin']);

        return Inertia::render('MyTasks/Index', [
            'allTasks' => $allTasks->values(),
            'taskGroups' => [
                'overdue' => $grouped['overdue']->values(),
                'dueToday' => $grouped['dueToday']->values(),
                'upcoming' => $grouped['upcoming']->values(),
                'later' => $grouped['later']->values(),
                'noDueDate' => $grouped['noDueDate']->values(),
            ],
            'stats' => [
                'total' => $activeTasks->count(),
                'overdue' => $grouped['overdue']->count(),
                'dueToday' => $grouped['dueToday']->count(),
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
