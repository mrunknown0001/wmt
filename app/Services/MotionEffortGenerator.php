<?php

namespace App\Services;

use App\Models\TaskMotionSegment;
use App\Models\TaskTimeLog;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Turning the clock into a day's effort.
 *
 * The clock measures wall time, which is not effort: a task can sit in motion
 * over a weekend, and two tasks can be in motion at once without anybody
 * working sixteen hours. So a day is shared out rather than added up.
 *
 * For one person on one day, take every stretch of work that touched the day:
 *
 *     scale       = min(1, available / Σ overlap)
 *     generated_i = overlap_i × scale
 *
 * Under a full day the clocks are taken at face value. Over it they are scaled
 * back in proportion, so the day never claims more than the person had to give.
 * Proportional and not equal: two hours on one task and eight on another is not
 * an even split of the day, and pretending otherwise would flatter the task
 * nobody spent any time on.
 *
 * What somebody said outranks what the clock inferred. A pause carries a figure
 * for that task's day, and an approved correction carries one too; both are
 * taken as given, subtracted from what the day has left, and their tasks drop
 * out of the sharing entirely.
 *
 * Recomputing is always safe. The generator owns only the rows it wrote and
 * has never touched anything a person entered or argued for, so running it
 * again over any day produces the same answer from the same evidence.
 */
class MotionEffortGenerator
{
    /** Where a row came from. Only the first is ever recalculated. */
    public const MOTION = 'motion';
    public const DECLARED = 'declared';
    public const MANUAL = 'manual';

    /** A working day for somebody who has never been given one. */
    public const DEFAULT_CAPACITY_MINUTES = 480;

    /**
     * Work out one person's day and write it down.
     *
     * @return int Minutes generated across the day.
     */
    public static function forDay(User $user, Carbon $day): int
    {
        $from = $day->copy()->startOfDay();
        $to = $day->copy()->endOfDay();

        $segments = TaskMotionSegment::query()
            ->where('user_id', $user->id)
            ->overlapping($from, $to)
            ->get();

        // What the person has already said about this day, by task. A pause
        // figure and an approved correction are both statements, and neither is
        // the generator's to revise.
        $stated = TaskTimeLog::query()
            ->where('user_id', $user->id)
            ->whereDate('logged_on', $from->toDateString())
            ->where(fn ($q) => $q->where('source', '!=', self::MOTION)->orWhereNotNull('amended_at'))
            ->get();

        $statedByTask = $stated->groupBy('task_id')->map(fn ($rows) => (int) $rows->sum('minutes'));

        // Whatever is left of the day after the statements have taken their cut.
        $capacity = self::capacityFor($user);
        $available = max(0, $capacity - (int) $stated->sum('minutes'));

        // Overlap per task, ignoring the ones already spoken for. Several
        // stretches on one task in a day are one task's overlap, not two.
        $overlap = [];

        foreach ($segments as $segment) {
            if (isset($statedByTask[$segment->task_id])) {
                continue;
            }

            $minutes = $segment->minutesWithin($from, $to);

            if ($minutes > 0) {
                $overlap[$segment->task_id] = ($overlap[$segment->task_id] ?? 0) + $minutes;
            }
        }

        $shares = self::share($overlap, $available);

        return DB::transaction(function () use ($user, $from, $shares) {
            // Rows the generator wrote for this day that the day no longer
            // supports — a stretch deleted, or a task now spoken for.
            TaskTimeLog::query()
                ->where('user_id', $user->id)
                ->whereDate('logged_on', $from->toDateString())
                ->where('source', self::MOTION)
                ->whereNull('amended_at')
                ->when($shares !== [], fn ($q) => $q->whereNotIn('task_id', array_keys($shares)))
                ->delete();

            foreach ($shares as $taskId => $minutes) {
                $existing = TaskTimeLog::query()
                    ->where('user_id', $user->id)
                    ->where('task_id', $taskId)
                    ->whereDate('logged_on', $from->toDateString())
                    ->where('source', self::MOTION)
                    ->whereNull('amended_at')
                    ->first();

                if ($existing) {
                    $existing->update(['minutes' => $minutes]);

                    continue;
                }

                TaskTimeLog::create([
                    'task_id' => $taskId,
                    'user_id' => $user->id,
                    'minutes' => $minutes,
                    'source' => self::MOTION,
                    'logged_on' => $from->toDateString(),
                ]);
            }

            return array_sum($shares);
        });
    }

    /**
     * Every day a stretch touched, regenerated for whoever it belongs to.
     *
     * Called when a stretch closes, because a pause on Thursday can settle
     * Tuesday and Wednesday as well: the clock ran through both.
     */
    public static function forSegment(TaskMotionSegment $segment): void
    {
        if (! $segment->user_id) {
            return;   // nobody to credit
        }

        $user = $segment->user ?? User::find($segment->user_id);

        if (! $user) {
            return;
        }

        $day = $segment->started_at->copy()->startOfDay();
        $last = ($segment->ended_at ?? now())->copy()->startOfDay();

        // A stretch left open for months would otherwise regenerate months of
        // days on every event; the nightly pass has been keeping up with those.
        $limit = 92;

        while ($day->lessThanOrEqualTo($last) && $limit-- > 0) {
            self::forDay($user, $day);
            $day->addDay();
        }
    }

    /** Everyone who had the clock running on a day, settled for that day. */
    public static function forEveryoneOn(Carbon $day): int
    {
        $userIds = TaskMotionSegment::query()
            ->overlapping($day->copy()->startOfDay(), $day->copy()->endOfDay())
            ->whereNotNull('user_id')
            ->distinct()
            ->pluck('user_id');

        $people = 0;

        foreach (User::whereIn('id', $userIds)->get() as $user) {
            self::forDay($user, $day);
            $people++;
        }

        return $people;
    }

    /**
     * Share what is left of a day out in proportion to the clocks.
     *
     * Rounding is settled by handing the remainder to the largest share, so a
     * day that was scaled down adds up to exactly what was available rather
     * than a few minutes either side of it.
     *
     * @param  array<int, int>  $overlap  task id => minutes the clock ran
     * @return array<int, int>  task id => minutes to record
     */
    private static function share(array $overlap, int $available): array
    {
        $total = array_sum($overlap);

        if ($total === 0 || $available === 0) {
            return [];
        }

        // Under the day's capacity, the clocks stand as they are.
        if ($total <= $available) {
            return array_filter($overlap, fn ($m) => $m > 0);
        }

        $shares = [];

        foreach ($overlap as $taskId => $minutes) {
            $shares[$taskId] = (int) floor($minutes * $available / $total);
        }

        $shares = array_filter($shares, fn ($m) => $m > 0);

        if ($shares === []) {
            return [];
        }

        $remainder = $available - array_sum($shares);

        if ($remainder > 0) {
            $largest = array_keys($shares, max($shares))[0];
            $shares[$largest] += $remainder;
        }

        return $shares;
    }

    /** The length of this person's working day. */
    private static function capacityFor(User $user): int
    {
        $capacity = (int) $user->daily_capacity_minutes;

        return $capacity > 0 ? min($capacity, TaskTimeLog::MAX_MINUTES) : self::DEFAULT_CAPACITY_MINUTES;
    }
}
