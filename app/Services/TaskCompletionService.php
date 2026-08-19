<?php

namespace App\Services;

use App\Models\Task;

/**
 * The one rule about completion that changes state rather than just displaying
 * it: a parent whose subtasks are all finished is itself finished.
 *
 * The percentage shown in the list is derived in the frontend (see
 * resources/js/taskCompletion.js) because every input is already loaded there
 * and the list updates optimistically. Nothing is duplicated here — this asks
 * only "are they all done", which needs no percentages.
 */
class TaskCompletionService
{
    /**
     * A cancelled subtask is not outstanding work, so it neither blocks the
     * parent from completing nor counts towards it. A parent whose subtasks are
     * *all* cancelled is left alone: nothing was actually finished.
     */
    private const IGNORED_STATUSES = ['cancelled'];

    /**
     * Parents already being closed in the current cascade.
     *
     * Not a plain "am I running" flag: completing a parent is *meant* to come
     * back through the observer so a grandparent closes in turn, and a boolean
     * would stop the cascade at the first level. This only bars revisiting a
     * task already on the stack, which a cyclic parent_id chain would otherwise
     * spin on forever.
     *
     * @var array<int, true>
     */
    private static array $closing = [];

    /**
     * Called after any task is saved. When the saved task is a subtask and its
     * siblings are now all done, the parent is completed too — and because that
     * write comes back through the observer, a grandparent completes in turn.
     */
    public static function syncParent(Task $task): void
    {
        if (!$task->parent_id || isset(self::$closing[$task->parent_id])) {
            return;
        }

        $parent = $task->parent()->first();

        if (!$parent || in_array($parent->status, Task::CLOSING_STATUSES, true)) {
            return;
        }

        if (!self::allSubtasksComplete($parent)) {
            return;
        }

        self::$closing[$parent->id] = true;

        try {
            // A normal update, not saveQuietly: the model's own hooks stamp
            // completed_at and broadcast the change, and the cascade to a
            // grandparent depends on this coming back through the observer.
            $parent->update(['status' => 'done']);
        } finally {
            unset(self::$closing[$parent->id]);
        }
    }

    /** True when the parent has subtasks and every one that counts is done. */
    public static function allSubtasksComplete(Task $parent): bool
    {
        $counted = $parent->subtasks()
            ->whereNotIn('status', self::IGNORED_STATUSES)
            ->pluck('status');

        return $counted->isNotEmpty() && $counted->every(fn ($s) => $s === 'done');
    }
}
