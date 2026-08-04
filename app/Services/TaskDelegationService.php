<?php

namespace App\Services;

use App\Models\Task;
use App\Models\TaskDelegation;
use App\Models\TaskDelegationItem;
use App\Models\User;
use App\Notifications\TaskDelegationNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Handing someone's tasks to a stand-in, and taking them back again.
 *
 * A task has one assignee, so cover here means replacement rather than the
 * additive arrangement approval delegation uses. That makes the return trip the
 * hard part, and it is why every move is written to task_delegation_items: the
 * hand-back reads the ledger instead of assuming the delegation's owner was the
 * previous holder, which stops being true the moment anyone reassigns something
 * by hand mid-period.
 *
 * Two rules worth stating outright:
 *
 *  - Cover is not transitive. A task already sitting with a stand-in is never
 *    picked up by a second delegation, so A → B → C cannot happen. Chains are
 *    how work ends up somewhere nobody chose.
 *  - Finished work stays finished. Tasks that are done or cancelled are neither
 *    handed over nor handed back, so completion history keeps naming whoever
 *    actually did the work.
 */
class TaskDelegationService
{
    /**
     * Set while this service is moving tasks itself.
     *
     * The observer that catches newly assigned work would otherwise fire on our
     * own writes and hand a task straight back out again.
     */
    private static bool $suspended = false;

    /**
     * Is this person's work currently being covered?
     *
     * capture() runs on every task save in the application and almost always
     * has nothing to do, so this is the cheap gate in front of the rest. It is
     * deliberately a query rather than a memo: queue workers live for hours,
     * and a cached "nobody is away" would outlast the delegation that proved it
     * wrong. One indexed lookup on (user_id, status) is the honest price.
     */
    private static function isCovered(int $userId): bool
    {
        return TaskDelegation::running()->where('user_id', $userId)->exists();
    }

    /** The delegation currently holding this person's work, if any. */
    public static function runningFor(int $userId, ?Carbon $date = null): ?TaskDelegation
    {
        return TaskDelegation::running($date)
            ->where('user_id', $userId)
            ->with('delegates')
            ->first();
    }

    /**
     * Switch a delegation on and hand over everything the person is holding.
     *
     * Safe to call twice — tasks already in the ledger are skipped — so a
     * delegation created on the morning it starts can be activated immediately
     * without the scheduler doing it again.
     *
     * @return int how many tasks changed hands
     */
    public static function activate(TaskDelegation $delegation): int
    {
        $delegates = self::availableDelegates($delegation);

        if ($delegates->isEmpty()) {
            // Nobody left to cover — every stand-in was deactivated between
            // setting this up and it starting. Leave it scheduled rather than
            // marking it active over an empty hand-over.
            return 0;
        }

        $tasks = self::coverableTasks((int) $delegation->user_id)->get();

        $dealt = self::deal($delegation, $tasks, $delegates);

        $delegation->forceFill([
            'status' => TaskDelegation::ACTIVE,
            'activated_at' => $delegation->activated_at ?? now(),
        ])->save();

        self::notifyDelegates($delegation, $delegates);

        return $dealt;
    }

    /**
     * End a delegation and give the tasks back.
     *
     * @return int how many tasks returned to their original owner
     */
    public static function restore(TaskDelegation $delegation): int
    {
        $items = $delegation->items()
            ->whereNull('restored_at')
            ->with('task')
            ->get();

        $returned = 0;

        self::withoutCapture(function () use ($items, &$returned) {
            foreach ($items as $item) {
                if (self::handBack($item)) {
                    $returned++;
                }

                // Closed out either way. A task somebody deliberately moved on
                // during the period should not be dragged back weeks later.
                $item->restored_at = now();
                $item->save();
            }
        });

        $delegation->forceFill([
            'status' => TaskDelegation::ENDED,
            'ended_at' => now(),
        ])->save();

        if ($delegation->user && $returned > 0) {
            $delegation->user->notify(
                TaskDelegationNotification::returned($delegation, $returned)
            );
        }

        return $returned;
    }

    /**
     * Give one task back, if it is still the stand-in's to give.
     *
     * Three reasons to leave it where it is: the task is gone, somebody
     * reassigned it to a third person, or the stand-in finished it — in which
     * case the completion should keep naming them.
     */
    private static function handBack(TaskDelegationItem $item): bool
    {
        $task = $item->task;

        if (!$task) {
            return false;
        }

        if ((int) $task->assigned_to !== (int) $item->delegate_id) {
            return false;
        }

        if (in_array($task->status, Task::CLOSING_STATUSES, true)) {
            return false;
        }

        $task->assigned_to = $item->original_assignee_id;
        $task->saveQuietly();

        return true;
    }

    /**
     * Hand over a task assigned to someone who is already away.
     *
     * Called from the task observer, so work arriving mid-period is covered too
     * — otherwise anything raised the day after someone left would sit with a
     * person who is not there to do it.
     *
     * @return bool whether the task was handed to a stand-in
     */
    public static function capture(Task $task): bool
    {
        if (self::$suspended || !$task->assigned_to) {
            return false;
        }

        if (in_array($task->status, Task::CLOSING_STATUSES, true)) {
            return false;
        }

        // The cheap test first — nearly every save in the application lands
        // here with nobody away, and this answers from memory.
        if (!self::isCovered((int) $task->assigned_to)) {
            return false;
        }

        // Already covered. This is what keeps cover from chaining: a task
        // sitting with B on A's behalf is not picked up again when B goes away.
        if (self::alreadyCovered((int) $task->id)) {
            return false;
        }

        $delegation = self::runningFor((int) $task->assigned_to);

        if (!$delegation) {
            return false;
        }

        $delegates = self::availableDelegates($delegation);

        if ($delegates->isEmpty()) {
            return false;
        }

        return self::deal($delegation, collect([$task]), $delegates) > 0;
    }

    /**
     * Deal tasks to stand-ins, one each in turn.
     *
     * The starting point is how many tasks this delegation has already dealt,
     * so a task arriving on day three continues the rotation rather than
     * restarting it and piling everything on the first stand-in.
     *
     * @return int how many were dealt
     */
    private static function deal(TaskDelegation $delegation, Collection $tasks, Collection $delegates): int
    {
        if ($tasks->isEmpty()) {
            return 0;
        }

        $offset = $delegation->items()->count();
        $count = $delegates->count();
        $dealt = 0;

        self::withoutCapture(function () use ($tasks, $delegates, $delegation, $offset, $count, &$dealt) {
            DB::transaction(function () use ($tasks, $delegates, $delegation, $offset, $count, &$dealt) {
                foreach ($tasks->values() as $i => $task) {
                    $delegate = $delegates[($offset + $i) % $count];

                    if ((int) $delegate->id === (int) $task->assigned_to) {
                        continue; // already theirs; nothing to hand over
                    }

                    TaskDelegationItem::create([
                        'task_delegation_id' => $delegation->id,
                        'task_id' => $task->id,
                        'original_assignee_id' => $task->assigned_to,
                        'delegate_id' => $delegate->id,
                        'assigned_at' => now(),
                    ]);

                    $task->assigned_to = $delegate->id;
                    $task->saveQuietly();

                    $dealt++;
                }
            });
        });

        return $dealt;
    }

    /** Unfinished tasks this person holds that are not already covered. */
    private static function coverableTasks(int $userId)
    {
        return Task::query()
            ->where('assigned_to', $userId)
            ->whereNotIn('status', Task::CLOSING_STATUSES)
            ->whereNotExists(fn ($q) => $q
                ->selectRaw(1)
                ->from('task_delegation_items')
                ->whereColumn('task_delegation_items.task_id', 'tasks.id')
                ->whereNull('task_delegation_items.restored_at'));
    }

    private static function alreadyCovered(int $taskId): bool
    {
        return TaskDelegationItem::where('task_id', $taskId)
            ->whereNull('restored_at')
            ->exists();
    }

    /**
     * The stand-ins who can actually take work, in deal order.
     *
     * @return Collection<int, User>
     */
    private static function availableDelegates(TaskDelegation $delegation): Collection
    {
        return $delegation->delegates
            ->filter(fn (User $u) => $u->is_active)
            ->values();
    }

    private static function notifyDelegates(TaskDelegation $delegation, Collection $delegates): void
    {
        foreach ($delegates as $delegate) {
            $share = $delegation->items()
                ->where('delegate_id', $delegate->id)
                ->whereNull('restored_at')
                ->count();

            $delegate->notify(TaskDelegationNotification::started($delegation, $share));
        }
    }

    /** Run a callback with the new-task observer switched off. */
    private static function withoutCapture(callable $callback): void
    {
        $previous = self::$suspended;
        self::$suspended = true;

        try {
            $callback();
        } finally {
            self::$suspended = $previous;
        }
    }

    /**
     * Move every delegation that has come due, in both directions.
     *
     * Ending runs first: if someone's cover ends today and another starts
     * today, the tasks must be back with them before the new one takes a
     * snapshot, or the second stand-in would inherit the first one's pile.
     *
     * @return array{started: int, ended: int, tasks_out: int, tasks_back: int}
     */
    public static function processDue(?Carbon $date = null): array
    {
        $summary = ['started' => 0, 'ended' => 0, 'tasks_out' => 0, 'tasks_back' => 0];

        foreach (TaskDelegation::dueToEnd($date)->with('user')->get() as $delegation) {
            $summary['tasks_back'] += self::restore($delegation);
            $summary['ended']++;
        }

        foreach (TaskDelegation::dueToStart($date)->with('delegates')->get() as $delegation) {
            // Past its end date before it ever started — a range set in the
            // past, or a scheduler that did not run for a while. Close it out
            // rather than handing work over and taking it straight back.
            if (!$delegation->covers($date)) {
                $delegation->forceFill([
                    'status' => TaskDelegation::ENDED,
                    'ended_at' => now(),
                ])->save();

                continue;
            }

            $summary['tasks_out'] += self::activate($delegation);

            // activate() leaves it scheduled when no stand-in can take work, so
            // the count follows the status rather than the return value — a
            // person with nothing open still counts as started.
            if ($delegation->status === TaskDelegation::ACTIVE) {
                $summary['started']++;
            }
        }

        return $summary;
    }
}
