<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MyTaskController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        $today = now()->startOfDay();

        $allTasks = Task::with('project:id,name', 'parent:id,title')
            ->where('assigned_to', $user->id)
            ->orderByRaw('CASE WHEN due_date IS NULL THEN 1 ELSE 0 END')
            ->orderBy('due_date')
            ->orderBy('priority', 'desc')
            ->get();

        $activeTasks = $allTasks->whereNotIn('status', ['done', 'cancelled']);

        $grouped = [
            'overdue' => $activeTasks->filter(fn ($t) => $t->due_date && $t->due_date->lt($today))->values(),
            'dueToday' => $activeTasks->filter(fn ($t) => $t->due_date && $t->due_date->eq($today))->values(),
            'upcoming' => $activeTasks->filter(fn ($t) => $t->due_date && $t->due_date->gt($today) && $t->due_date->lte($today->copy()->addDays(7)))->values(),
            'later' => $activeTasks->filter(fn ($t) => $t->due_date && $t->due_date->gt($today->copy()->addDays(7)))->values(),
            'noDueDate' => $activeTasks->filter(fn ($t) => !$t->due_date)->values(),
        ];

        return response()->json([
            'taskGroups' => $grouped,
            'stats' => [
                'total' => $activeTasks->count(),
                'overdue' => $grouped['overdue']->count(),
                'dueToday' => $grouped['dueToday']->count(),
            ],
        ]);
    }
}
