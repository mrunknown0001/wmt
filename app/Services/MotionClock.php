<?php

namespace App\Services;

use App\Models\Task;
use App\Models\TaskMotionSegment;
use App\Models\User;

/**
 * Opening and closing the stretches of work behind a task's clock.
 *
 * One rule, and everything else follows from it: a task has at most one open
 * stretch. Two would count the same hour twice and there would be no way to
 * tell afterwards which was real — the same reasoning the timer used to apply
 * to a person, applied now to the task.
 *
 * Every close regenerates the days it touched, so the effort behind a report is
 * never waiting on a nightly job to catch up with something that happened this
 * morning.
 */
class MotionClock
{
    /** Start a stretch, unless one is already running. */
    public static function open(Task $task, ?User $user = null): ?TaskMotionSegment
    {
        if (self::current($task)) {
            return null;
        }

        return TaskMotionSegment::create([
            'task_id' => $task->id,
            // Credited to whoever holds the task, which is what "their effort"
            // means here; falls back to the person doing the starting when the
            // task is nobody's yet.
            'user_id' => $task->assigned_to ?: $user?->id,
            'started_at' => now(),
        ]);
    }

    /** Stop the running stretch and settle the days it covered. */
    public static function close(Task $task): ?TaskMotionSegment
    {
        $segment = self::current($task);

        if (! $segment) {
            return null;
        }

        // A task assigned only after the work began still credits the person
        // holding it: better late than to nobody at all.
        if (! $segment->user_id && $task->assigned_to) {
            $segment->user_id = $task->assigned_to;
        }

        $segment->ended_at = now();
        $segment->save();

        MotionEffortGenerator::forSegment($segment->fresh());

        return $segment;
    }

    public static function current(Task $task): ?TaskMotionSegment
    {
        return TaskMotionSegment::where('task_id', $task->id)->open()->latest('started_at')->first();
    }
}
