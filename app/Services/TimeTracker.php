<?php

namespace App\Services;

use App\Models\Task;
use App\Models\TaskTimeLog;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Starting, stopping and recording work against tasks.
 *
 * The one rule the rest of the app relies on: a person has at most one running
 * timer. Two would double-count the same hour, and there is no way to tell
 * afterwards which was the real one.
 */
class TimeTracker
{
    /** A timer left running past this is a forgotten one, not a long day. */
    public const MAX_RUNNING_HOURS = 24;

    public static function running(User $user): ?TaskTimeLog
    {
        return TaskTimeLog::running()->where('user_id', $user->id)->latest('started_at')->first();
    }

    /**
     * Start the clock on a task, stopping whatever was already running.
     *
     * Switching tasks is the common case, so it stops the previous timer rather
     * than refusing — being told "stop the other one first" every time is how
     * people give up on time tracking.
     *
     * @return array{started: TaskTimeLog, stopped: ?TaskTimeLog}
     */
    public static function start(Task $task, User $user): array
    {
        return DB::transaction(function () use ($task, $user) {
            $stopped = self::stop($user);

            $started = TaskTimeLog::create([
                'task_id' => $task->id,
                'user_id' => $user->id,
                'started_at' => now(),
                'logged_on' => now()->toDateString(),
            ]);

            return ['started' => $started, 'stopped' => $stopped];
        });
    }

    /**
     * Stop the running timer and turn it into a finished entry.
     *
     * A timer left running overnight is capped rather than recorded: nobody
     * worked nineteen hours, and an outlier that large distorts every average
     * built on top of it.
     */
    public static function stop(User $user): ?TaskTimeLog
    {
        $running = self::running($user);

        if (!$running) {
            return null;
        }

        $minutes = min(
            $running->elapsedMinutes(),
            self::MAX_RUNNING_HOURS * 60,
        );

        $running->update([
            'minutes' => max(1, $minutes), // a sub-minute timer still happened
            'started_at' => null,
            // Credited to the day it began, so a shift crossing midnight lands
            // on the day the person would say they worked it.
            'logged_on' => $running->started_at->toDateString(),
        ]);

        return $running->fresh();
    }

    /** Record work by hand, for time that was never on a timer. */
    public static function log(Task $task, User $user, int $minutes, ?string $date = null, ?string $note = null): TaskTimeLog
    {
        if ($minutes < 1 || $minutes > TaskTimeLog::MAX_MINUTES) {
            throw ValidationException::withMessages([
                'minutes' => 'Enter between 1 minute and 24 hours.',
            ]);
        }

        return TaskTimeLog::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'minutes' => $minutes,
            'logged_on' => $date ?: now()->toDateString(),
            'note' => $note,
        ]);
    }

    /**
     * Parse what someone typed into an hours box.
     *
     * Accepts "1.5", "1:30" and "90m" because people write duration all three
     * ways, and rejecting two of them just produces wrong entries in the third.
     */
    public static function parseMinutes(?string $input): ?int
    {
        $input = trim((string) $input);

        if ($input === '') {
            return null;
        }

        if (preg_match('/^(\d+):([0-5]?\d)$/', $input, $m)) {
            return ((int) $m[1] * 60) + (int) $m[2];
        }

        if (preg_match('/^(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?$/i', $input, $m)) {
            return (int) round((float) $m[1]);
        }

        if (preg_match('/^(\d+(?:\.\d+)?)\s*h?(?:ours?|rs?)?$/i', $input, $m)) {
            return (int) round((float) $m[1] * 60);
        }

        return null;
    }

    /** "1h 30m", "45m", "—" — one way of writing a duration across the app. */
    public static function formatMinutes(?int $minutes): string
    {
        if ($minutes === null || $minutes <= 0) {
            return '—';
        }

        $hours = intdiv($minutes, 60);
        $rest = $minutes % 60;

        if ($hours === 0) {
            return $rest . 'm';
        }

        return $rest === 0 ? $hours . 'h' : $hours . 'h ' . $rest . 'm';
    }
}
