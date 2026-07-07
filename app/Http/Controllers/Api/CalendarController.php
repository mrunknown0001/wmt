<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CalendarController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate([
            'month' => ['required', 'string', 'regex:/^\d{4}-\d{2}$/'],
        ]);

        $user = $request->user();
        $date = Carbon::createFromFormat('Y-m', $request->input('month'));
        $startOfMonth = $date->copy()->startOfMonth()->startOfDay();
        $endOfMonth = $date->copy()->endOfMonth()->endOfDay();

        $tasks = Task::with('project:id,name')
            ->whereNotNull('due_date')
            ->whereBetween('due_date', [$startOfMonth, $endOfMonth])
            ->where(function ($query) use ($user) {
                $query->where('assigned_to', $user->id)
                    ->orWhereHas('collaborators', fn ($q) => $q->where('user_id', $user->id));
            })
            ->orderBy('due_date')
            ->orderBy('priority', 'desc')
            ->get()
            ->map(fn ($t) => [
                'id' => $t->id,
                'project_id' => $t->project_id,
                'project_name' => $t->project?->name,
                'title' => $t->title,
                'status' => $t->status,
                'priority' => $t->priority,
                'due_date' => $t->due_date->toIso8601String(),
            ]);

        return response()->json(['tasks' => $tasks]);
    }
}
