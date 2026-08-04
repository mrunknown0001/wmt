<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Services\OrgScope;
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

        // Whatever the browser asks for is narrowed to what this person is
        // actually entitled to before it reaches the query.
        $selection = OrgScope::permitted($user, [
            'divisions' => $request->input('divisions', []),
            'departments' => $request->input('departments', []),
            'teams' => $request->input('teams', []),
        ]);

        // "Everyone" is a flag rather than every unit id, which keeps the URL
        // short and skips the assignee filter altogether.
        $seesAll = OrgScope::seesEverything($user);
        $all = $seesAll && $request->boolean('all');

        $assigneeIds = OrgScope::usersIn($selection);

        $tasks = Task::with(['project:id,name', 'assignee:id,name'])
            ->unless($all, fn ($q) => $q->when(
                $assigneeIds->isEmpty(),
                // No org units picked — the calendar stays personal, which is
                // what it has always been.
                fn ($q) => $q->where('assigned_to', $user->id),
                fn ($q) => $q->whereIn('assigned_to', $assigneeIds)
            ))
            ->whereNotNull('due_date')
            ->whereBetween('due_date', [$gridStart, $gridEnd])
            ->orderBy('due_date')
            ->orderBy('priority', 'desc')
            ->get(['id', 'project_id', 'title', 'status', 'priority', 'due_date', 'due_time', 'assigned_to']);

        $units = OrgScope::visibleUnits($user);

        return Inertia::render('Calendar', [
            'tasks' => $tasks,
            'month' => $month,
            'year' => $year,
            'orgUnits' => [
                'divisions' => $units['divisions'],
                'departments' => $units['departments'],
                'teams' => $units['teams'],
                'canSeeAll' => $seesAll,
            ],
            'orgFilters' => $selection + ['all' => $all],
        ]);
    }
}
