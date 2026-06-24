<?php

namespace App\Http\Controllers;

use App\Models\Task;
use Inertia\Inertia;
use Inertia\Response;

class MyTaskController extends Controller
{
    public function index(): Response
    {
        $user = auth()->user();
        $today = now()->startOfDay();

        $tasks = Task::with('project')
            ->where('assigned_to', $user->id)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->orderByRaw('CASE WHEN due_date IS NULL THEN 1 ELSE 0 END')
            ->orderBy('due_date')
            ->orderBy('priority', 'desc')
            ->get();

        $grouped = [
            'overdue' => $tasks->filter(fn ($t) => $t->due_date && $t->due_date->lt($today)),
            'dueToday' => $tasks->filter(fn ($t) => $t->due_date && $t->due_date->eq($today)),
            'upcoming' => $tasks->filter(fn ($t) => $t->due_date && $t->due_date->gt($today) && $t->due_date->lte($today->copy()->addDays(7))),
            'later' => $tasks->filter(fn ($t) => $t->due_date && $t->due_date->gt($today->copy()->addDays(7))),
            'noDueDate' => $tasks->filter(fn ($t) => !$t->due_date),
        ];

        return Inertia::render('MyTasks/Index', [
            'taskGroups' => [
                'overdue' => $grouped['overdue']->values(),
                'dueToday' => $grouped['dueToday']->values(),
                'upcoming' => $grouped['upcoming']->values(),
                'later' => $grouped['later']->values(),
                'noDueDate' => $grouped['noDueDate']->values(),
            ],
            'stats' => [
                'total' => $tasks->count(),
                'overdue' => $grouped['overdue']->count(),
                'dueToday' => $grouped['dueToday']->count(),
            ],
        ]);
    }
}
