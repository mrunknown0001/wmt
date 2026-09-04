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

        // Measured in PHP rather than with TIMESTAMPDIFF(), which only MySQL
        // has. The rows are pulled either way — the sample is capped — so this
        // costs nothing and makes the whole report runnable on any driver.
        // Casting to int truncates toward zero, as TIMESTAMPDIFF did.
        $hours = $query->limit(self::SAMPLE_CAP)
            ->get(['tasks.created_at', 'tasks.completed_at'])
            ->map(fn (Task $t) => (int) $t->created_at->diffInHours($t->completed_at))
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
        //
        // Built with || rather than CONCAT(), which MySQL has and sqlite does
        // not. || is the SQL standard string concatenation operator and MySQL
        // reads it as such under PIPES_AS_CONCAT; to stay off that setting the
        // pieces are joined by the driver-neutral route below instead.
        $onTimeExpression = "tasks.completed_at <= COALESCE(
            " . self::concat('tasks.due_date', "' '", 'tasks.due_time') . ",
            " . self::concat('tasks.due_date', "' 23:59:59'") . "
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
            ->when($filters['approval_project_ids'] ?? null,
                fn ($q, $ids) => $q->whereHas('item', fn ($i) => $i->whereIn('approval_project_id', $ids)));

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
            ->when($filters['approval_project_ids'] ?? null,
                fn ($q, $ids) => $q->whereHas('item', fn ($i) => $i->whereIn('approval_project_id', $ids)))
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
            ->when($filters['approval_project_ids'] ?? null, function ($q, $ids) {
                $q->join('approval_items as it', 'it.id', '=', 'i.approval_item_id')
                    ->whereIn('it.approval_project_id', $ids);
            })
            ->whereNotNull('i.activated_at')
            ->whereNotNull('d.decided_at')
            ->whereBetween('d.decided_at', [$from, $to])
            ->select('u.id', 'u.name', 'i.activated_at', 'd.decided_at')
            ->limit(self::SAMPLE_CAP)
            ->get();

        // Grouped and averaged in PHP. The SQL version leaned on
        // TIMESTAMPDIFF(), which only MySQL has; the window is already bounded
        // by the report's date range and capped, so the rows are affordable.
        return $rows
            ->groupBy('id')
            ->map(function ($decisions) {
                $hours = $decisions->map(fn ($d) => (int) Carbon::parse($d->activated_at)
                    ->diffInHours(Carbon::parse($d->decided_at)));

                return [
                    'id' => $decisions->first()->id,
                    'name' => $decisions->first()->name,
                    'decisions' => $decisions->count(),
                    'average_hours' => round($hours->avg(), 1),
                    'slowest_hours' => (int) $hours->max(),
                ];
            })
            ->filter(fn ($row) => $row['decisions'] >= $minDecisions)
            ->sortByDesc('average_hours')
            ->take(20)
            ->values()
            ->all();
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
            ->when($filters['project_ids'] ?? null, fn ($q, $ids) => $q->whereIn('project_id', $ids));

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
        // Bucketed in PHP — YEARWEEK() is MySQL only. 'oW' is ISO year + ISO
        // week, the same key the SQL produced, and it sorts correctly as a
        // string across a year boundary ("202552" before "202601").
        return self::completedTasks($user, $from, $to, $filters)
            ->limit(self::SAMPLE_CAP)
            ->pluck('completed_at')
            ->groupBy(fn ($at) => $at->format('oW'))
            ->sortKeys()
            ->map(fn ($week) => [
                'week' => $week->min()->toDateString(),
                'total' => $week->count(),
            ])
            ->values()
            ->all();
    }

    /**
     * How estimates compared with the calendar, rather than with effort.
     *
     * estimateAccuracy() needs somebody to have logged their hours. This does
     * not: a task is stamped as started on its way into In Progress, and
     * completed_at is written when it closes, so the span between them costs
     * nobody a keystroke.
     *
     * It answers a different question, and the difference matters. Elapsed time
     * is how long a task sat open, not how long anyone worked on it — a job
     * started Monday and finished Friday reads as four days whether it took
     * four days of work or twenty minutes. Read it as "did this take longer
     * than we planned, in calendar terms", never as effort.
     */
    public static function elapsedAccuracy(User $user, Carbon $from, Carbon $to, array $filters = []): array
    {
        $estimated = self::completedTasks($user, $from, $to, $filters)
            ->where('tasks.estimated_minutes', '>', 0);

        $rows = (clone $estimated)
            ->limit(self::SAMPLE_CAP)
            ->get(['tasks.id', 'tasks.estimated_minutes', 'tasks.started_at', 'tasks.completed_at']);

        $compared = $rows
            ->filter(fn (Task $t) => $t->started_at && $t->completed_at && $t->completed_at->greaterThanOrEqualTo($t->started_at))
            ->values();

        if ($compared->isEmpty()) {
            return [
                'count' => 0,
                'estimated_not_started' => $rows->count(),
                'median_ratio' => null,
                'average_ratio' => null,
                'over' => 0,
                'within_10pct' => 0,
                'under' => 0,
                'estimated_minutes' => 0,
                'elapsed_minutes' => 0,
                'partial' => false,
            ];
        }

        $elapsedOf = fn (Task $t) => (int) $t->started_at->diffInMinutes($t->completed_at);
        $ratioOf = fn (Task $t) => $elapsedOf($t) / $t->estimated_minutes;

        $ratios = $compared->map($ratioOf)->sort()->values();

        $within = $compared->filter(fn (Task $t) => abs($ratioOf($t) - 1) <= 0.1)->count();
        $over = $compared->filter(fn (Task $t) => $ratioOf($t) > 1.1)->count();

        return [
            'count' => $compared->count(),
            // Finished and estimated, but never stamped as started — nothing to
            // measure a span against.
            'estimated_not_started' => $rows->count() - $compared->count(),
            'median_ratio' => self::percentile($ratios, 0.5, 2),
            'average_ratio' => round($ratios->avg(), 2),
            'over' => $over,
            'within_10pct' => $within,
            'under' => $compared->count() - $within - $over,
            'estimated_minutes' => (int) $compared->sum('estimated_minutes'),
            'elapsed_minutes' => (int) $compared->sum($elapsedOf),
            'partial' => $rows->count() >= self::SAMPLE_CAP,
        ];
    }

    /**
     * Effort recorded in the window: who spent time, and how much.
     *
     * Dated by logged_on, not by when the entry was typed and not by the task's
     * completion — effort accrues on work that is still open, and a manual
     * entry exists precisely so yesterday's site visit lands on yesterday.
     *
     * Running timers are excluded, because a timer still going has no duration
     * yet. They are counted separately rather than silently dropped: an hour
     * that is missing from a total should say so.
     */
    public static function effort(User $user, Carbon $from, Carbon $to, array $filters = []): array
    {
        $base = self::visibleTimeLogs($user, $filters)
            ->whereBetween('task_time_logs.logged_on', [$from->toDateString(), $to->toDateString()]);

        $running = (clone $base)->whereNull('task_time_logs.minutes')->count();

        $entries = (clone $base)
            ->whereNotNull('task_time_logs.minutes')
            ->with('user:id,name')
            ->limit(self::SAMPLE_CAP)
            ->get(['task_time_logs.id', 'task_time_logs.user_id', 'task_time_logs.minutes', 'task_time_logs.logged_on']);

        $people = $entries
            ->groupBy('user_id')
            ->map(fn (Collection $rows) => [
                'user_id' => $rows->first()->user_id,
                'name' => $rows->first()->user?->name ?? 'Unknown',
                'minutes' => (int) $rows->sum('minutes'),
                'entries' => $rows->count(),
            ])
            ->sortByDesc('minutes')
            ->values()
            ->all();

        return [
            'total_minutes' => (int) $entries->sum('minutes'),
            'entries' => $entries->count(),
            'people' => $people,
            'running' => $running,
            'partial' => $entries->count() >= self::SAMPLE_CAP,
        ];
    }

    /**
     * How estimates compared with the effort they actually took.
     *
     * Only tasks finished in the window that carry both an estimate and some
     * logged time — the ratio is meaningless without both.
     *
     * The two exclusion counts are the point rather than a footnote. A task
     * estimated but never logged against says nothing about accuracy, and if
     * most of them are like that then this figure describes a self-selected
     * handful rather than the team. A reader who cannot see that will read it
     * as the whole picture.
     */
    public static function estimateAccuracy(User $user, Carbon $from, Carbon $to, array $filters = []): array
    {
        $estimated = self::completedTasks($user, $from, $to, $filters)
            ->where('tasks.estimated_minutes', '>', 0);

        $rows = (clone $estimated)
            ->withSum(['timeLogs as logged_minutes' => fn ($q) => $q->whereNotNull('minutes')], 'minutes')
            ->limit(self::SAMPLE_CAP)
            ->get(['tasks.id', 'tasks.estimated_minutes']);

        $compared = $rows->filter(fn (Task $t) => (int) $t->logged_minutes > 0)->values();

        // Ratio of effort to estimate: 1.0 is exact, 2.0 took twice as long.
        $ratios = $compared
            ->map(fn (Task $t) => round($t->logged_minutes / $t->estimated_minutes, 3))
            ->sort()
            ->values();

        $within = $compared->filter(fn (Task $t) => abs(($t->logged_minutes / $t->estimated_minutes) - 1) <= 0.1)->count();
        $over = $compared->filter(fn (Task $t) => ($t->logged_minutes / $t->estimated_minutes) > 1.1)->count();

        return [
            'count' => $compared->count(),
            // Estimated but never logged against — the size of the blind spot.
            'estimated_not_logged' => $rows->count() - $compared->count(),
            'median_ratio' => $ratios->isEmpty() ? null : self::percentile($ratios, 0.5, 2),
            'average_ratio' => $ratios->isEmpty() ? null : round($ratios->avg(), 2),
            'within_10pct' => $within,
            'over' => $over,
            'under' => $compared->count() - $within - $over,
            'estimated_minutes' => (int) $compared->sum('estimated_minutes'),
            'logged_minutes' => (int) $compared->sum('logged_minutes'),
            'partial' => $rows->count() >= self::SAMPLE_CAP,
        ];
    }

    /**
     * Time entries on tasks this person may see, filtered like every other
     * report on the page.
     *
     * Scoped through the task rather than the entry: whether you may read
     * somebody's logged hours follows from whether you may open the work they
     * logged them against.
     */
    private static function visibleTimeLogs(User $user, array $filters = []): Builder
    {
        return \App\Models\TaskTimeLog::query()
            ->whereHas('task', function ($t) use ($user, $filters) {
                self::scopeVisible($t, $user)
                    ->when($filters['project_ids'] ?? null, fn ($q, $ids) => $q->whereIn('tasks.project_id', $ids))
                    ->when($filters['assigned_to'] ?? null, fn ($q, $ids) => $q->whereIn('tasks.assigned_to', $ids));
            });
    }

    /** Finished tasks in the window, scoped and filtered the same way everywhere. */
    private static function completedTasks(User $user, Carbon $from, Carbon $to, array $filters = []): Builder
    {
        return self::scopeVisible(Task::query(), $user)
            ->whereNotNull('completed_at')
            ->whereBetween('completed_at', [$from, $to])
            ->when($filters['project_ids'] ?? null, fn ($q, $ids) => $q->whereIn('project_id', $ids))
            ->when($filters['assigned_to'] ?? null, fn ($q, $ids) => $q->whereIn('assigned_to', $ids));
    }

    /**
     * Count, mean, median and 90th percentile for a set of durations.
     *
     * Nulls rather than zeros on an empty set: "no data" and "zero hours" are
     * different answers, and a chart showing 0 for the former is a lie.
     */
    /**
     * String concatenation that both MySQL and sqlite understand.
     *
     * MySQL's CONCAT() is not portable and sqlite's || is not valid MySQL
     * unless PIPES_AS_CONCAT is set, so the expression is chosen per driver.
     * The MySQL branch emits exactly what this code emitted before, so nothing
     * about the production query changes.
     */
    private static function concat(string ...$parts): string
    {
        return DB::connection()->getDriverName() === 'mysql'
            ? 'CONCAT(' . implode(', ', $parts) . ')'
            : '(' . implode(' || ', $parts) . ')';
    }

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

    /**
     * $precision is a parameter because these figures are not all the same
     * shape: one decimal is plenty for a span in hours, while a ratio near 1
     * carries its meaning in the second — 1.05 and 1.1 are "about right" and
     * "ten percent over", and rounding the first into the second says
     * something the data did not.
     */
    private static function percentile(Collection $sorted, float $p, int $precision = 1): float
    {
        $count = $sorted->count();

        if ($count === 0) {
            return 0.0;
        }

        $index = ($count - 1) * $p;
        $low = (int) floor($index);
        $high = (int) ceil($index);

        if ($low === $high) {
            return round((float) $sorted[$low], $precision);
        }

        // Interpolate, so an even-sized set gets a real midpoint rather than
        // whichever neighbour happened to be picked.
        $weight = $index - $low;

        return round($sorted[$low] * (1 - $weight) + $sorted[$high] * $weight, $precision);
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
