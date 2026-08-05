<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Task;
use App\Models\TaskActivity;
use App\Models\User;
use App\Services\OrgScope;
use App\Services\PersonnelOverdueService;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    /** How many overdue tasks the dashboard card shows before deferring to the full page. */
    private const PERSONNEL_OVERDUE_PREVIEW = 8;

    public function __invoke(): Response
    {
        $user = auth()->user();
        $prefs = $user->getDashboardPreferences();

        // --- Always present ---
        $myProjects = Project::with('owner')
            ->where('owner_id', $user->id)
            ->where('status', '!=', 'archived')
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')])
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get();

        $archivedProjects = Project::with('owner')
            ->where('owner_id', $user->id)
            ->where('status', 'archived')
            ->withCount('tasks')
            ->withCount(['tasks as completed_tasks_count' => fn ($q) => $q->where('status', 'done')])
            ->orderBy('updated_at', 'desc')
            ->take(5)
            ->get();

        // Projects where the user is assigned tasks or is a member, but not the owner
        $involvedProjectIds = Task::where('assigned_to', $user->id)
            ->whereNotNull('project_id')
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
                ->where('status', '!=', 'archived')
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
                    ->pastDue()
                    ->whereNotIn('status', ['done', 'cancelled'])
                    ->count(),
            ],
            'myProjects' => $myProjects,
            'archivedProjects' => $archivedProjects,
            'involvedProjects' => $involvedProjects,
            'myRecentTasks' => $myRecentTasks,
            'dashboardPreferences' => $prefs,
        ];

        // Overdue work across the people this person supervises. Only for
        // heads and leaders — everyone else has nobody to be responsible for,
        // and their own overdue count is already in the stats above.
        if (OrgScope::hasAnyScope($user)) {
            $peopleIds = OrgScope::manageablePeopleIds($user)
                // Their own overdue tasks are reported separately; this card is
                // about the people reporting to them.
                ->reject(fn ($id) => (int) $id === (int) $user->id)
                ->values();

            $summary = PersonnelOverdueService::summary($peopleIds);

            $data['personnelOverdue'] = [
                'tasks' => PersonnelOverdueService::tasks($peopleIds, self::PERSONNEL_OVERDUE_PREVIEW)->all(),
                'total' => $summary['total'],
                'people' => $summary['people'],
                'worstDaysLate' => $summary['worstDaysLate'],
                'preview' => self::PERSONNEL_OVERDUE_PREVIEW,
            ];
        }

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
            $weeks = collect(range(7, 0))->map(fn ($i) => now()->startOfWeek()->subWeeks($i));
            $trendStart = $weeks->first();

            // Bucketed in PHP rather than with YEARWEEK(), which only MySQL
            // has — the whole dashboard failed to render on any other driver,
            // which is why none of it could be covered by a test. The window is
            // eight weeks, so the rows pulled here are bounded either way.
            // 'oW' is ISO year + ISO week, the same key YEARWEEK(x, 3) produced.
            $createdByWeek = Task::where('created_at', '>=', $trendStart)
                ->pluck('created_at')
                ->countBy(fn ($at) => $at->format('oW'));

            $completedByWeek = Task::where('status', 'done')
                ->whereNotNull('completed_at')
                ->where('completed_at', '>=', $trendStart)
                ->pluck('completed_at')
                ->countBy(fn ($at) => $at->format('oW'));

            $data['charts'] = [
                'tasksByStatus' => Task::selectRaw('status, count(*) as count')
                    ->groupBy('status')
                    ->pluck('count', 'status'),
                'tasksByPriority' => Task::selectRaw('priority, count(*) as count')
                    ->groupBy('priority')
                    ->pluck('count', 'priority'),
                'completionTrend' => $weeks->map(fn ($week) => [
                    'label' => $week->format('M j'),
                    'created' => (int) ($createdByWeek[$week->format('oW')] ?? 0),
                    'completed' => (int) ($completedByWeek[$week->format('oW')] ?? 0),
                ])->values(),
            ];
        }

        // Due Today / Overdue
        if ($prefs['showDueToday']) {
            $data['urgentItems'] = Task::with('project')
                ->where('assigned_to', $user->id)
                ->whereNotIn('status', ['done', 'cancelled'])
                ->where(function ($q) {
                    $q->where(function ($sub) {
                        $sub->pastDue();
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
                // whereHas rather than having(): MySQL tolerates HAVING with no
                // GROUP BY, other drivers reject it outright. Same meaning —
                // keep people who have at least one open task.
                ->whereHas('assignedTasks', fn ($q) => $q->whereNotIn('status', ['done', 'cancelled']))
                ->orderByDesc('assigned_tasks_count')
                ->take(10)
                ->get();
        }

        return Inertia::render('Dashboard', $data);
    }
}
