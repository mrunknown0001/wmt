<?php

namespace App\Services;

use App\Models\ApprovalStepInstance;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\FolderService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Reports built from what the app already records.
 *
 * Two habits run through this file:
 *
 *  - The median is reported next to the mean. One slow outlier drags an average
 *    somewhere no real task ever was; the median says what a typical one took.
 *  - Every figure carries the count it was computed from. "83% on time" across
 *    six tasks is not the same claim as across six hundred, and a reader who
 *    cannot see which is which will treat them alike.
 */
class ReportService
{
    /** Rows pulled into PHP for percentile work. Beyond this the figures are marked partial. */
    public const SAMPLE_CAP = 20000;

    /**
     * Constrain a task query to the projects this person may see.
     *
     * The same clause the projects list uses, so a report can never show work
     * from somewhere they cannot open.
     */
    public static function scopeVisible(Builder $query, User $user): Builder
    {
        if ($user->can('manage-projects') || $user->hasRole('executive')) {
            return $query;
        }

        $overseen = FolderService::overseenFolderIds($user);

        return $query->whereHas('project', function ($p) use ($user, $overseen) {
            $p->where('owner_id', $user->id)
                ->orWhereHas('members', fn ($m) => $m->where('users.id', $user->id))
                ->orWhereHas('tasks', fn ($t) => $t->where('assigned_to', $user->id))
                ->orWhereIn('folder_id', $overseen);
        });
    }

    /**
     * How long finished work took, from raising to done.
     *
     * Measured on completion date, not creation: the question is "what did we
     * finish this month and how long had it been open", which is what a
     * throughput conversation is actually about.
     */
    public static function cycleTime(User $user, Carbon $from, Carbon $to, array $filters = []): array
    {
        $query = self::completedTasks($user, $from, $to, $filters);

        $hours = $query->limit(self::SAMPLE_CAP)
            ->pluck(DB::raw('TIMESTAMPDIFF(HOUR, tasks.created_at, tasks.completed_at) as h'))
            ->map(fn ($h) => (int) $h)
            ->filter(fn ($h) => $h >= 0)
            ->values();

        return array_merge(self::summarise($hours), [
            'buckets' => self::buckets($hours),
        ]);
    }

    /**
     * Of the work finished in this window that had a due date, how much landed
     * on time.
     *
     * Tasks with no due date are excluded and counted separately — they cannot
     * be late, and folding them in as "on time" would flatter the number.
     */
    public static function onTime(User $user, Carbon $from, Carbon $to, array $filters = []): array
    {
        $base = self::completedTasks($user, $from, $to, $filters);

        $withoutDue = (clone $base)->whereNull('due_date')->count();

        $dated = (clone $base)->whereNotNull('due_date');
        $total = (clone $dated)->count();

        // The deadline is the due time when one is set, and the end of the due
        // day when it is not — matching Task::dueAt() rather than treating
        // every due date as midnight.
        $onTimeExpression = "tasks.completed_at <= COALESCE(
            CONCAT(tasks.due_date, ' ', tasks.due_time),
            CONCAT(tasks.due_date, ' 23:59:59')
        )";

        $onTime = (clone $dated)->whereRaw($onTimeExpression)->count();

        return [
            'total' => $total,
            'on_time' => $onTime,
            'late' => $total - $onTime,
            'rate' => $total > 0 ? round(($onTime / $total) * 100, 1) : null,
            'without_due_date' => $withoutDue,
        ];
    }

    /**
     * How long approval steps took to clear, overall and by step name.
     *
     * Only steps that finished inside the window. A step still sitting open is
     * the very thing a turnaround report should not quietly average away — it
     * is reported separately as work in progress.
     */
    public static function approvalTurnaround(User $user, Carbon $from, Carbon $to, array $filters = []): array
    {
        $base = ApprovalStepInstance::query()
            ->whereNotNull('activated_at')
            ->whereNotNull('completed_at')
            ->whereBetween('completed_at', [$from, $to])
            ->when($filters['approval_project_id'] ?? null,
                fn ($q, $id) => $q->whereHas('item', fn ($i) => $i->where('approval_project_id', $id)));

        $rows = (clone $base)
            ->with('step:id,name')
            ->limit(self::SAMPLE_CAP)
            ->get(['id', 'approval_step_id', 'activated_at', 'completed_at', 'status']);

        $hours = $rows->map(fn ($r) => (int) $r->activated_at->diffInHours($r->completed_at))
            ->filter(fn ($h) => $h >= 0)->values();

        $byStep = $rows->groupBy(fn ($r) => $r->step?->name ?? 'Unnamed step')
            ->map(function (Collection $group) {
                $groupHours = $group->map(fn ($r) => (int) $r->activated_at->diffInHours($r->completed_at))
                    ->filter(fn ($h) => $h >= 0)->values();

                return array_merge(self::summarise($groupHours), [
                    'approved' => $group->where('status', 'approved')->count(),
                    'rejected' => $group->where('status', 'rejected')->count(),
                ]);
            })
            ->sortByDesc('count')
            ->take(15);

        $stillOpen = ApprovalStepInstance::where('status', 'active')
            ->when($filters['approval_project_id'] ?? null,
                fn ($q, $id) => $q->whereHas('item', fn ($i) => $i->where('approval_project_id', $id)))
            ->count();

        return array_merge(self::summarise($hours), [
            'by_step' => $byStep->map(fn ($v, $k) => $v + ['name' => $k])->values()->all(),
            'still_open' => $stillOpen,
        ]);
    }

    /**
     * Who is holding approvals up, measured from the step activating to their
     * decision.
     *
     * Ranked slowest first, because that is the list worth acting on. Anyone
     * with fewer than three decisions is left out — two slow days in a row is
     * not a pattern, and naming someone on that basis would be unfair.
     */
    public static function approverTurnaround(Carbon $from, Carbon $to, array $filters = [], int $minDecisions = 3): array
    {
        $rows = DB::table('approval_step_decisions as d')
            ->join('approval_step_instances as i', 'i.id', '=', 'd.approval_step_instance_id')
            ->join('users as u', 'u.id', '=', 'd.decided_by')
            ->when($filters['approval_project_id'] ?? null, function ($q, $id) {
                $q->join('approval_items as it', 'it.id', '=', 'i.approval_item_id')
                    ->where('it.approval_project_id', $id);
            })
            ->whereNotNull('i.activated_at')
            ->whereNotNull('d.decided_at')
            ->whereBetween('d.decided_at', [$from, $to])
            ->selectRaw('u.id, u.name, COUNT(*) as decisions,
                AVG(TIMESTAMPDIFF(HOUR, i.activated_at, d.decided_at)) as avg_hours,
                MAX(TIMESTAMPDIFF(HOUR, i.activated_at, d.decided_at)) as max_hours')
            ->groupBy('u.id', 'u.name')
            ->having('decisions', '>=', $minDecisions)
            ->orderByDesc('avg_hours')
            ->limit(20)
            ->get();

        return $rows->map(fn ($r) => [
            'id' => $r->id,
            'name' => $r->name,
            'decisions' => (int) $r->decisions,
            'average_hours' => round((float) $r->avg_hours, 1),
            'slowest_hours' => (int) $r->max_hours,
        ])->all();
    }

    /**
     * How often work is escalating, and where.
     *
     * Counted on tasks currently carrying a level rather than on historic
     * events, because that is what the schema records — stated plainly so the
     * figure is not read as "escalations this month".
     */
    public static function escalations(User $user, array $filters = []): array
    {
        $base = self::scopeVisible(Task::query(), $user)
            ->where('escalation_level', '>', 0)
            ->when($filters['project_id'] ?? null, fn ($q, $id) => $q->where('project_id', $id));

        $byLevel = (clone $base)
            ->selectRaw('escalation_level, COUNT(*) as total')
            ->groupBy('escalation_level')
            ->orderBy('escalation_level')
            ->get()
            ->map(fn ($r) => ['level' => (int) $r->escalation_level, 'total' => (int) $r->total])
            ->all();

        $byProject = (clone $base)
            ->selectRaw('project_id, COUNT(*) as total')
            ->whereNotNull('project_id')
            ->groupBy('project_id')
            ->orderByDesc('total')
            ->limit(10)
            ->get();

        $names = Project::whereIn('id', $byProject->pluck('project_id'))->pluck('name', 'id');

        return [
            'total' => (clone $base)->count(),
            'still_open' => (clone $base)->whereNotIn('status', ['done', 'cancelled'])->count(),
            'by_level' => $byLevel,
            'by_project' => $byProject->map(fn ($r) => [
                'name' => $names[$r->project_id] ?? 'Unknown',
                'total' => (int) $r->total,
            ])->all(),
        ];
    }

    /** Tasks finished per week across the window, for a trend line. */
    public static function throughput(User $user, Carbon $from, Carbon $to, array $filters = []): array
    {
        return self::completedTasks($user, $from, $to, $filters)
            ->selectRaw('YEARWEEK(tasks.completed_at, 3) as yw, MIN(DATE(tasks.completed_at)) as starts, COUNT(*) as total')
            ->groupBy('yw')
            ->orderBy('yw')
            ->get()
            ->map(fn ($r) => ['week' => $r->starts, 'total' => (int) $r->total])
            ->all();
    }

    /** Finished tasks in the window, scoped and filtered the same way everywhere. */
    private static function completedTasks(User $user, Carbon $from, Carbon $to, array $filters = []): Builder
    {
        return self::scopeVisible(Task::query(), $user)
            ->whereNotNull('completed_at')
            ->whereBetween('completed_at', [$from, $to])
            ->when($filters['project_id'] ?? null, fn ($q, $id) => $q->where('project_id', $id))
            ->when($filters['assigned_to'] ?? null, fn ($q, $id) => $q->where('assigned_to', $id));
    }

    /**
     * Count, mean, median and 90th percentile for a set of durations.
     *
     * Nulls rather than zeros on an empty set: "no data" and "zero hours" are
     * different answers, and a chart showing 0 for the former is a lie.
     */
    private static function summarise(Collection $hours): array
    {
        $count = $hours->count();

        if ($count === 0) {
            return [
                'count' => 0,
                'average_hours' => null,
                'median_hours' => null,
                'p90_hours' => null,
                'partial' => false,
            ];
        }

        $sorted = $hours->sort()->values();

        return [
            'count' => $count,
            'average_hours' => round($hours->avg(), 1),
            'median_hours' => self::percentile($sorted, 0.5),
            'p90_hours' => self::percentile($sorted, 0.9),
            // The sample hit the cap, so these describe part of the window.
            'partial' => $count >= self::SAMPLE_CAP,
        ];
    }

    private static function percentile(Collection $sorted, float $p): float
    {
        $count = $sorted->count();

        if ($count === 0) {
            return 0.0;
        }

        $index = ($count - 1) * $p;
        $low = (int) floor($index);
        $high = (int) ceil($index);

        if ($low === $high) {
            return round((float) $sorted[$low], 1);
        }

        // Interpolate, so an even-sized set gets a real midpoint rather than
        // whichever neighbour happened to be picked.
        $weight = $index - $low;

        return round($sorted[$low] * (1 - $weight) + $sorted[$high] * $weight, 1);
    }

    /** A rough shape of the distribution, which a median alone cannot show. */
    private static function buckets(Collection $hours): array
    {
        $edges = [
            ['label' => 'Same day', 'max' => 24],
            ['label' => '1–3 days', 'max' => 72],
            ['label' => '4–7 days', 'max' => 168],
            ['label' => '1–2 weeks', 'max' => 336],
            ['label' => 'Over 2 weeks', 'max' => PHP_INT_MAX],
        ];

        $out = [];
        $previous = -1;

        foreach ($edges as $edge) {
            $out[] = [
                'label' => $edge['label'],
                'total' => $hours->filter(fn ($h) => $h > $previous && $h <= $edge['max'])->count(),
            ];
            $previous = $edge['max'];
        }

        return $out;
    }
}
