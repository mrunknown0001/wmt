<?php

namespace App\Services;

use App\Models\Task;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Creating and removing "this task waits on that one" edges.
 *
 * The three refusals below are the whole point of routing this through a
 * service rather than letting a controller write the pivot directly. Each one
 * produces a graph the Gantt cannot draw and the close-gate cannot resolve.
 */
class TaskDependencyService
{
    /**
     * Add "task waits on dependency".
     *
     * @throws ValidationException
     */
    public static function add(Task $task, int $dependsOnId, ?int $actorId = null): void
    {
        if ($task->id === $dependsOnId) {
            self::refuse('A task cannot depend on itself.');
        }

        $dependency = Task::find($dependsOnId);

        if (!$dependency) {
            self::refuse('That task no longer exists.');
        }

        // Same project, for the same reason a task may only be filed into its own
        // project's section: a cross-project edge has no arrow to draw, because
        // the two ends never appear on the same chart.
        if ($task->project_id !== $dependency->project_id) {
            self::refuse('A dependency has to be a task in the same project.');
        }

        if (self::wouldCycle($task->id, $dependsOnId)) {
            self::refuse(
                "\"{$dependency->title}\" already depends on this task, directly or through others. "
                . 'Adding this would make a loop that could never complete.'
            );
        }

        // firstOrCreate rather than create: the unique index would otherwise turn
        // an impatient double-click into a 500.
        DB::table('task_dependencies')->insertOrIgnore([
            'task_id' => $task->id,
            'depends_on_task_id' => $dependsOnId,
            'created_by' => $actorId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public static function remove(Task $task, int $dependsOnId): void
    {
        $task->dependencies()->detach($dependsOnId);
    }

    /**
     * Would adding task -> dependsOn close a loop?
     *
     * Walk what the proposed dependency itself waits on, transitively. If the
     * task we are adding the edge to turns up in there, the edge closes a ring
     * and nothing in it could ever be closed — every member would be waiting on
     * another member.
     *
     * Iterative rather than recursive, and with a seen-set, so a graph that is
     * already malformed cannot put the request into an infinite loop.
     */
    public static function wouldCycle(int $taskId, int $dependsOnId): bool
    {
        $seen = [];
        $frontier = [$dependsOnId];

        while ($frontier) {
            $next = DB::table('task_dependencies')
                ->whereIn('task_id', $frontier)
                ->pluck('depends_on_task_id')
                ->all();

            if (in_array($taskId, $next, true)) {
                return true;
            }

            $seen = array_merge($seen, $frontier);
            $frontier = array_values(array_diff(array_unique($next), $seen));
        }

        return false;
    }

    /**
     * Carry a task's dependencies onto its next recurrence.
     *
     * A recurring task that waits on something waits on it every cycle, so the
     * edges are copied rather than left behind on the first occurrence. Edges
     * pointing at the source task itself are skipped: the new occurrence must
     * not end up waiting on the occurrence it replaces.
     */
    public static function copyTo(Task $from, Task $to): void
    {
        $ids = $from->dependencies()->pluck('tasks.id')
            ->reject(fn ($id) => $id === $to->id || $id === $from->id)
            ->values();

        foreach ($ids as $id) {
            DB::table('task_dependencies')->insertOrIgnore([
                'task_id' => $to->id,
                'depends_on_task_id' => $id,
                'created_by' => $to->created_by,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private static function refuse(string $message): void
    {
        throw ValidationException::withMessages(['depends_on_task_id' => $message]);
    }
}
