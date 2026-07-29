<?php

namespace App\Services;

use App\Models\Project;
use App\Models\Task;
use Illuminate\Support\Facades\DB;

class TaskSeriesService
{
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
