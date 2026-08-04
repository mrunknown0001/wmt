<?php

namespace App\Services;

use App\Models\Task;
use App\Models\User;
use Carbon\CarbonPeriod;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * How much work each person is carrying, day by day.
 *
 * The model in one sentence: a task's estimate is spread evenly across the
 * working days between its start and due dates, and compared against what that
 * person can absorb in a day.
 *
 * Two deliberate simplifications, both visible in the UI so nobody is misled:
 *
 *  - Spreading is even. Real work is lumpy, but any other distribution would be
 *    a guess dressed up as data.
 *  - A task with no estimate contributes nothing to the load and is counted
 *    separately, so a light-looking week is never mistaken for a real one.
 */
class WorkloadService
{
    /** Weekdays someone works when they have not said otherwise: Mon-Fri. */
    public const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

    /** Guard rail on the window, so a stray query can't ask for ten years. */
    public const MAX_DAYS = 92;

    /** @return array<int, int> ISO weekdays this person works. */
    public static function workingDays(User $user): array
    {
        $days = collect($user->working_days ?: self::DEFAULT_WORKING_DAYS)
            ->map(fn ($d) => (int) $d)
            ->filter(fn ($d) => $d >= 1 && $d <= 7)
            ->unique()->sort()->values()->all();

        return $days ?: self::DEFAULT_WORKING_DAYS;
    }

    public static function worksOn(User $user, Carbon $date): bool
    {
        return in_array((int) $date->isoWeekday(), self::workingDays($user), true);
    }

    /**
     * Load per person per day across a window.
     *
     * @param  Collection<int, User>  $users
     * @return array{days: array, rows: array}
     */
    public static function build(Collection $users, Carbon $from, Carbon $to, ?int $projectId = null): array
    {
        if ($from->diffInDays($to) > self::MAX_DAYS) {
            $to = $from->copy()->addDays(self::MAX_DAYS);
        }

        $dates = collect(CarbonPeriod::create($from->copy()->startOfDay(), $to->copy()->startOfDay()))
            ->map(fn ($d) => Carbon::instance($d));

        $tasks = self::openTasksFor($users->pluck('id'), $from, $to, $projectId);
        $byUser = $tasks->groupBy('assigned_to');

        $rows = $users->map(function (User $user) use ($byUser, $dates) {
            $userTasks = $byUser->get($user->id, collect());
            $capacity = max(0, (int) $user->daily_capacity_minutes);

            // date string => minutes
            $load = [];
            $unestimated = 0;
            $undated = 0;

            foreach ($userTasks as $task) {
                if (!$task->estimated_minutes) {
                    $unestimated++;
                    continue;
                }

                $spread = self::spread($task, $user);

                if ($spread === []) {
                    $undated++;
                    continue;
                }

                foreach ($spread as $day => $minutes) {
                    $load[$day] = ($load[$day] ?? 0) + $minutes;
                }
            }

            $cells = $dates->map(function (Carbon $date) use ($load, $capacity, $user) {
                $key = $date->toDateString();
                $working = self::worksOn($user, $date);
                $dayCapacity = $working ? $capacity : 0;
                $minutes = (int) ($load[$key] ?? 0);

                return [
                    'date' => $key,
                    'minutes' => $minutes,
                    'capacity' => $dayCapacity,
                    'working' => $working,
                    // Null rather than a division by zero on a non-working day
                    // that happens to carry work — the UI flags those instead.
                    'ratio' => $dayCapacity > 0 ? round($minutes / $dayCapacity, 2) : null,
                ];
            })->values()->all();

            return [
                'user' => ['id' => $user->id, 'name' => $user->name],
                'daily_capacity_minutes' => $capacity,
                'working_days' => self::workingDays($user),
                'cells' => $cells,
                'total_minutes' => array_sum(array_column($cells, 'minutes')),
                'total_capacity' => array_sum(array_column($cells, 'capacity')),
                'task_count' => $userTasks->count(),
                'unestimated_count' => $unestimated,
                'undated_count' => $undated,
            ];
        })->values()->all();

        return [
            'days' => $dates->map(fn (Carbon $d) => [
                'date' => $d->toDateString(),
                'weekday' => $d->isoWeekday(),
                'label' => $d->format('D j M'),
            ])->values()->all(),
            'rows' => $rows,
        ];
    }

    /**
     * Spread one task's estimate over the days it is being worked.
     *
     * Start and due date both set: evenly across the working days between them.
     * Only a due date: it all lands on the due date, which is the honest
     * reading — nobody has said when it starts.
     *
     * @return array<string, int> date => minutes
     */
    public static function spread(Task $task, User $user): array
    {
        $estimate = (int) $task->estimated_minutes;

        if ($estimate <= 0 || !$task->due_date) {
            return [];
        }

        $due = $task->due_date->copy()->startOfDay();
        $start = $task->start_date ? $task->start_date->copy()->startOfDay() : $due;

        if ($start->greaterThan($due)) {
            $start = $due;
        }

        $days = collect(CarbonPeriod::create($start, $due))
            ->map(fn ($d) => Carbon::instance($d))
            ->filter(fn (Carbon $d) => self::worksOn($user, $d))
            ->values();

        // A window entirely outside the person's working days still has to land
        // somewhere, or the work would silently vanish from the total.
        if ($days->isEmpty()) {
            return [$due->toDateString() => $estimate];
        }

        $per = intdiv($estimate, $days->count());
        $remainder = $estimate % $days->count();

        $out = [];
        foreach ($days as $i => $day) {
            // The remainder goes on the first days rather than being dropped,
            // so the spread always sums back to the original estimate.
            $out[$day->toDateString()] = $per + ($i < $remainder ? 1 : 0);
        }

        return $out;
    }

    /** Open tasks that could touch the window, for the given people. */
    private static function openTasksFor(Collection $userIds, Carbon $from, Carbon $to, ?int $projectId): Collection
    {
        return Task::query()
            ->whereIn('assigned_to', $userIds)
            ->whereNotIn('status', ['done', 'cancelled'])
            ->when($projectId, fn ($q) => $q->where('project_id', $projectId))
            ->where(function ($q) use ($from, $to) {
                // Anything whose start..due window overlaps the range, plus
                // overdue work, which is still someone's problem today.
                $q->whereBetween('due_date', [$from->toDateString(), $to->toDateString()])
                    ->orWhere(function ($overlap) use ($from, $to) {
                        $overlap->whereNotNull('start_date')
                            ->where('start_date', '<=', $to->toDateString())
                            ->where('due_date', '>=', $from->toDateString());
                    })
                    ->orWhere('due_date', '<', $from->toDateString());
            })
            ->get(['id', 'title', 'assigned_to', 'project_id', 'start_date', 'due_date', 'estimated_minutes', 'status']);
    }
}
