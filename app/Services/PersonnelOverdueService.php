<?php

namespace App\Services;

use App\Models\Task;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Overdue work across the people someone supervises.
 *
 * Shared between the dashboard card and the full page so the two cannot drift:
 * a card saying "12 overdue" that opens onto a list of nine is worse than no
 * card at all.
 *
 * Overdue is date-only — due before today, unfinished. That matches
 * utils.js isPastDue and the rest of the app; a task due today is not late yet,
 * whatever the hour.
 */
class PersonnelOverdueService
{
    /** Enough for a real backlog without shipping an unbounded page. */
    public const LIMIT = 500;

    /** Bands used for the severity breakdown, in days late. */
    public const BUCKETS = [
        'recent' => ['label' => '1–3 days', 'min' => 1, 'max' => 3],
        'week' => ['label' => '4–7 days', 'min' => 4, 'max' => 7],
        'month' => ['label' => '8–30 days', 'min' => 8, 'max' => 30],
        'stale' => ['label' => 'Over 30 days', 'min' => 31, 'max' => null],
    ];

    /**
     * @param  Collection<int, int>  $peopleIds
     * @return \Illuminate\Database\Eloquent\Builder
     */
    public static function query($peopleIds)
    {
        return Task::query()
            ->whereIn('assigned_to', $peopleIds)
            ->whereNotIn('status', Task::CLOSING_STATUSES)
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<', now()->toDateString());
    }

    /**
     * Overdue tasks, longest outstanding first.
     *
     * @param  Collection<int, int>  $peopleIds
     * @return Collection<int, array>
     */
    public static function tasks($peopleIds, int $limit = self::LIMIT): Collection
    {
        if ($peopleIds->isEmpty()) {
            return collect();
        }

        $today = now()->startOfDay();

        return self::query($peopleIds)
            ->with(['project:id,name', 'assignee:id,name'])
            ->orderBy('due_date')
            ->orderByRaw('due_time is null, due_time')
            ->limit($limit)
            ->get(['id', 'project_id', 'title', 'status', 'priority', 'due_date', 'due_time', 'assigned_to'])
            ->map(function (Task $task) use ($today) {
                $daysLate = (int) $task->due_date->startOfDay()->diffInDays($today);

                return [
                    'id' => $task->id,
                    'title' => $task->title,
                    'status' => $task->status,
                    'priority' => $task->priority,
                    'due_date' => $task->due_date->toDateString(),
                    'due_time' => $task->due_time,
                    'days_late' => $daysLate,
                    'bucket' => self::bucketFor($daysLate),
                    'url' => $task->getEditUrl(),
                    'project' => $task->project
                        ? ['id' => $task->project->id, 'name' => $task->project->name]
                        : null,
                    'assignee' => $task->assignee
                        ? ['id' => $task->assignee->id, 'name' => $task->assignee->name]
                        : null,
                ];
            })
            ->values();
    }

    /**
     * Headline numbers, counted in the database rather than from the capped
     * list — the page has to be able to say "500 of 812".
     *
     * @param  Collection<int, int>  $peopleIds
     */
    public static function summary($peopleIds): array
    {
        $empty = [
            'total' => 0,
            'people' => 0,
            'projects' => 0,
            'worstDaysLate' => 0,
            'averageDaysLate' => 0,
        ];

        if ($peopleIds->isEmpty()) {
            return $empty;
        }

        $total = self::query($peopleIds)->count();

        if ($total === 0) {
            return $empty;
        }

        $oldest = self::query($peopleIds)->min('due_date');

        // Averaged in PHP over the due dates rather than with a database date
        // function, which would need different SQL for MySQL and sqlite.
        $dueDates = self::query($peopleIds)->pluck('due_date');
        $today = now()->startOfDay();
        $totalDays = $dueDates->sum(
            fn ($date) => (int) Carbon::parse($date)->startOfDay()->diffInDays($today)
        );

        return [
            'total' => $total,
            'people' => self::query($peopleIds)->distinct()->count('assigned_to'),
            'projects' => self::query($peopleIds)->whereNotNull('project_id')->distinct()->count('project_id'),
            'worstDaysLate' => $oldest
                ? (int) Carbon::parse($oldest)->startOfDay()->diffInDays($today)
                : 0,
            'averageDaysLate' => (int) round($totalDays / $total),
        ];
    }

    /**
     * How many tasks sit in each severity band.
     *
     * Derived from due dates in PHP for the same reason as the average: one
     * code path instead of one per database.
     *
     * @param  Collection<int, int>  $peopleIds
     */
    public static function buckets($peopleIds): array
    {
        $counts = array_fill_keys(array_keys(self::BUCKETS), 0);

        if ($peopleIds->isEmpty()) {
            return $counts;
        }

        $today = now()->startOfDay();

        foreach (self::query($peopleIds)->pluck('due_date') as $date) {
            $days = (int) Carbon::parse($date)->startOfDay()->diffInDays($today);
            $counts[self::bucketFor($days)]++;
        }

        return $counts;
    }

    private static function bucketFor(int $daysLate): string
    {
        foreach (self::BUCKETS as $key => $band) {
            if ($daysLate >= $band['min'] && ($band['max'] === null || $daysLate <= $band['max'])) {
                return $key;
            }
        }

        return 'recent';
    }
}
