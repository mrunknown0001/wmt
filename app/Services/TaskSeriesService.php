<?php

namespace App\Services;

use App\Models\Project;
use App\Models\Task;
use Illuminate\Support\Facades\DB;

class TaskSeriesService
{
    /**
     * Send the counter back to the start and free the numbers held by tasks in
     * the trash, so the gaps they left can be used again.
     *
     * Numbering is only worth resetting because deleting tasks leaves holes.
     * A trashed task's row still occupies the unique index, so its number stays
     * unusable until it is released here — which is the whole point of the
     * action.
     *
     * Numbers held by live tasks are untouched, and claiming skips anything
     * still taken, so this can never produce a duplicate. What it can do is
     * hand a trashed task's old number to something new; restoring that task
     * later marks it, rather than fighting over the number.
     *
     * @return array{released: int, next: int}
     */
    public static function resetCounter(Project $project): array
    {
        return DB::transaction(function () use ($project) {
            $locked = Project::query()->whereKey($project->getKey())->lockForUpdate()->first();

            if (!$locked) {
                return ['released' => 0, 'next' => 1];
            }

            // Query builder on purpose: this clears a derived identifier on
            // rows that are in the trash. Going through Eloquent would fire
            // observers and broadcast updates for deleted tasks.
            $released = DB::table('tasks')
                ->where('project_id', $locked->id)
                ->whereNotNull('deleted_at')
                ->whereNotNull('series_sequence')
                ->update(['series_sequence' => null]);

            // Back to the start. The next claim walks forward past whatever is
            // still held, so the first free gap is what actually gets issued.
            $next = Project::nextFreeSequence($locked->id, 1);

            $locked->task_series_next = $next;
            $locked->saveQuietly();

            $project->task_series_next = $next;

            return ['released' => $released, 'next' => $next];
        });
    }

    /** How many trashed tasks are still holding a number in this project. */
    public static function heldByTrashed(Project $project): int
    {
        return Task::onlyTrashed()
            ->where('project_id', $project->id)
            ->whereNotNull('series_sequence')
            ->count();
    }

    /**
     * Give a number to every task in the project that hasn't got one.
     *
     * Switching numbering on for a project that already has tasks would
     * otherwise leave those tasks permanently unnumbered — which defeats the
     * point, since the ones people talk about most are the ones already there.
     *
     * Tasks are numbered oldest first, so the sequence matches the order the
     * work was actually raised in.
     *
     * @return int how many tasks were numbered
     */
    public static function backfill(Project $project): int
    {
        return DB::transaction(function () use ($project) {
            // Lock the project so a task being created right now can't be handed
            // a number this backfill is about to reuse.
            $locked = Project::query()->whereKey($project->getKey())->lockForUpdate()->first();

            if (!$locked || !$locked->hasTaskSeries()) {
                return 0;
            }

            $sequence = max(1, (int) $locked->task_series_next);
            $numbered = 0;

            // withTrashed: a soft-deleted task can be restored, and it would come
            // back either unnumbered or — worse — holding a number that had since
            // been issued to something else.
            Task::withTrashed()
                ->where('project_id', $locked->id)
                ->whereNull('series_sequence')
                ->orderBy('id')
                ->select('id')
                ->chunkById(500, function ($tasks) use ($locked, &$sequence, &$numbered) {
                    foreach ($tasks as $task) {
                        // Query builder rather than the model: this writes a
                        // derived identifier, not a change to the task's content.
                        // Going through Eloquent would fire observers and
                        // broadcast an update for every task in the project.
                        DB::table('tasks')->where('id', $task->id)->update([
                            'series_number' => $locked->formatTaskSeries($sequence),
                            'series_sequence' => $sequence,
                        ]);
                        $sequence++;
                        $numbered++;
                    }
                });

            $locked->task_series_next = $sequence;
            $locked->saveQuietly();

            // Keep the in-memory instance in step with what was just written, so
            // a caller rendering a preview straight after doesn't show a stale
            // "next number".
            $project->task_series_next = $sequence;

            return $numbered;
        });
    }
}
