<?php

namespace App\Http\Controllers;

use App\Models\Task;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CalendarController extends Controller
{
    public function index(Request $request): Response
    {
        $user = auth()->user();
        $month = (int) $request->input('month', now()->month);
        $year = (int) $request->input('year', now()->year);

        $startOfMonth = Carbon::create($year, $month, 1)->startOfDay();
        $endOfMonth = $startOfMonth->copy()->endOfMonth()->endOfDay();

        // Include overflow days visible on the calendar grid
        $gridStart = $startOfMonth->copy()->startOfWeek(Carbon::SUNDAY);
        $gridEnd = $endOfMonth->copy()->endOfWeek(Carbon::SATURDAY);

        $tasks = Task::with('project:id,name')
            ->where('assigned_to', $user->id)
            ->whereNotNull('due_date')
            ->whereBetween('due_date', [$gridStart, $gridEnd])
            ->orderBy('due_date')
            ->orderBy('priority', 'desc')
            ->get(['id', 'project_id', 'title', 'status', 'priority', 'due_date']);

        return Inertia::render('Calendar', [
            'tasks' => $tasks,
            'month' => $month,
            'year' => $year,
        ]);
    }
}
