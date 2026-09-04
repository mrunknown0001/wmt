<?php

namespace App\Services;

use App\Models\Task;
use App\Models\TaskTimeLog;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Putting the clock down for the day, and picking it back up.
 *
 * There is no timer to start any more, and no box to type an afternoon into.
 * A task's clock is the record — it starts when the work starts and stops when
 * the work stops — and effort is worked out from it by MotionEffortGenerator.
 *
 * What is left here is the human end of that: the pause, where somebody says
 * what today was actually worth, and the resume that puts them back to work.
 * A pause figure is a statement rather than an inference, so it is recorded as
 * one and the generator works around it.
 */
class TimeTracker
{
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
     * asleep. It is a suggestion, not a reading: whoever presses Pause knows
     * what they actually did.
     *
     * @return array{minutes: int, from: \Illuminate\Support\Carbon}
     */
    public static function suggestedDayMinutes(Task $task, User $user): array
    {
        $segment = MotionClock::current($task);

        $from = $segment?->started_at?->copy() ?? $task->motionSegmentStartedAt() ?? now();
        $dayStart = now()->copy()->startOfDay();

        if ($from->lessThan($dayStart)) {
            $from = $dayStart;
        }

        $minutes = $from->greaterThan(now()) ? 0 : (int) $from->diffInMinutes(now());

        $cap = (int) ($user->daily_capacity_minutes ?: MotionEffortGenerator::DEFAULT_CAPACITY_MINUTES);
        $cap = max(1, min($cap, TaskTimeLog::MAX_MINUTES));

        return ['minutes' => min($minutes, $cap), 'from' => $from];
    }

    /**
     * Put the clock down for the day, recording what was worked.
     *
     * Three things at once, because they are one thought: the stretch of work
     * ends, the day's figure is recorded as a statement, and the clock stops so
     * the night ahead is not counted as time in motion.
     *
     * Zero minutes is a legitimate answer — a task picked up and put down again
     * without progress — and is recorded rather than skipped. Saying "none" is
     * still saying: without the statement on the record the generator would
     * look at a clock that ran all day and infer a day's work from it, which is
     * the opposite of what was just said.
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

        $result = DB::transaction(function () use ($task, $user, $minutes, $note) {
            $log = self::declare($task, $user, $minutes, now()->toDateString(), $note);

            $task->motion_paused_at = now();
            $task->save();

            return ['task' => $task, 'log' => $log];
        });

        // After the statement is on record, so the generator shares out what is
        // left of the day rather than what was left before the pause.
        MotionClock::close($task);

        return ['task' => $result['task']->fresh(), 'log' => $result['log']];
    }

    /**
     * Pick the clock back up.
     *
     * The pause just ended is added to the total the task has spent stopped,
     * and a new stretch starts now — which is what the next Pause will measure
     * from, and what the generator will share out for the rest of the day.
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

        MotionClock::open($task);

        return $task->fresh();
    }

    /**
     * Record a figure somebody stated: a pause, or an approved correction.
     *
     * Distinct from anything the clock inferred. The generator subtracts these
     * from the day and leaves their tasks alone, so a statement is never
     * quietly recalculated into something its author did not say.
     */
    public static function declare(
        Task $task,
        User $user,
        int $minutes,
        ?string $date = null,
        ?string $note = null,
        string $source = MotionEffortGenerator::DECLARED,
    ): TaskTimeLog {
        // Nothing is an answer when somebody is closing their own day; it is
        // not an answer when they are asking for an entry to be created.
        $floor = $source === MotionEffortGenerator::DECLARED ? 0 : 1;

        if ($minutes < $floor || $minutes > TaskTimeLog::MAX_MINUTES) {
            throw ValidationException::withMessages([
                'minutes' => 'Enter between 1 minute and 24 hours.',
            ]);
        }

        return TaskTimeLog::create([
            'task_id' => $task->id,
            'user_id' => $user->id,
            'minutes' => $minutes,
            'source' => $source,
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
