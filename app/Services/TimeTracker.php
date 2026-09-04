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

    /**
     * How long today's stretch of work has been, for the Pause box to offer.
     *
     * Measured from whichever is later: when this stretch began, or midnight.
     * A task in motion since last week has not been worked since last week, so
     * counting from its start would offer a preposterous number — and a task
     * resumed at nine this morning should offer the time since nine.
     *
     * Capped at the person's own working day, because the only thing an
     * uncapped figure can do is talk somebody into logging the hours they were
     * asleep. It is a suggestion, not a reading: whoever presses Pause can say
     * what they actually worked.
     *
     * @return array{minutes: int, from: \Illuminate\Support\Carbon}
     */
    public static function suggestedDayMinutes(Task $task, User $user): array
    {
        $from = $task->motionSegmentStartedAt() ?? now();
        $dayStart = now()->copy()->startOfDay();

        if ($from->lessThan($dayStart)) {
            $from = $dayStart;
        }

        $minutes = $from->greaterThan(now()) ? 0 : (int) $from->diffInMinutes(now());

        $cap = (int) ($user->daily_capacity_minutes ?: TaskTimeLog::MAX_MINUTES);
        $cap = max(1, min($cap, TaskTimeLog::MAX_MINUTES));

        return ['minutes' => min($minutes, $cap), 'from' => $from];
    }

    /**
     * Put the clock down for the day, recording what was worked.
     *
     * Two things at once, because they are one thought: the day's work becomes
     * an ordinary time log dated today, and the motion clock stops so the night
     * ahead is not counted as time in motion.
     *
     * Zero minutes is a legitimate answer — a task picked up and put down again
     * without progress — and writes no entry rather than an empty one.
     *
     * @return array{task: Task, log: ?TaskTimeLog}
     */
    public static function pauseDay(Task $task, User $user, int $minutes, ?string $note = null): array
    {
        if (! $task->motionIsRunning()) {
            throw ValidationException::withMessages([
                'minutes' => 'This task is not in motion, so there is nothing to pause.',
            ]);
        }

        if ($task->motionIsPaused()) {
            throw ValidationException::withMessages([
                'minutes' => 'This task is already paused.',
            ]);
        }

        if ($minutes < 0 || $minutes > TaskTimeLog::MAX_MINUTES) {
            throw ValidationException::withMessages([
                'minutes' => 'Enter between 0 minutes and 24 hours.',
            ]);
        }

        return DB::transaction(function () use ($task, $user, $minutes, $note) {
            $log = $minutes > 0
                ? self::log($task, $user, $minutes, now()->toDateString(), $note)
                : null;

            $task->motion_paused_at = now();
            $task->save();

            return ['task' => $task->fresh(), 'log' => $log];
        });
    }

    /**
     * Pick the clock back up.
     *
     * The pause just ended is added to the total the task has spent stopped,
     * and the new stretch starts now — which is what the next Pause will
     * measure from.
     */
    public static function resumeMotion(Task $task): Task
    {
        if (! $task->motionIsPaused()) {
            return $task;
        }

        $paused = (int) $task->motion_paused_at->diffInMinutes(now());

        $task->motion_paused_minutes = (int) $task->motion_paused_minutes + max(0, $paused);
        $task->motion_paused_at = null;
        $task->motion_resumed_at = now();
        $task->save();

        return $task->fresh();
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
