<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Repairs tasks that were completed by dragging on the board.
 *
 * That path used to write status through a query-builder mass update, which
 * skips Eloquent events — including the hook that stamps completed_at. Those
 * tasks read as done everywhere but count as never-completed in any metric
 * built on the timestamp (completion rates, "completed this week", the
 * productivity score, the division/department/user KPI pages).
 *
 * The real completion time is unrecoverable. updated_at is the closest proxy:
 * for a task whose last change was the drag itself it is exact, and for one
 * edited afterwards it is late rather than wrong.
 */
class BackfillTaskCompletedAt extends Command
{
    protected $signature = 'tasks:backfill-completed-at
                            {--dry-run : Report what would change without writing}
                            {--force : Skip the confirmation prompt}
                            {--with-trashed : Include soft-deleted tasks}';

    protected $description = 'Set completed_at on done tasks that are missing it, using updated_at as the completion time';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $affectedRows = fn () => DB::table('tasks')
            ->where('status', 'done')
            ->whereNull('completed_at')
            ->when(! $this->option('with-trashed'), fn ($q) => $q->whereNull('deleted_at'));

        $total = $affectedRows()->count();

        if ($total === 0) {
            $this->info('Nothing to backfill — every done task already has a completed_at.');
            return self::SUCCESS;
        }

        $this->warn("{$total} done task(s) are missing completed_at.");

        $sample = $affectedRows()
            ->select('id', 'project_id', 'title', 'updated_at')
            ->orderBy('id')
            ->limit(10)
            ->get();

        $this->table(
            ['id', 'project', 'title', 'completed_at will become'],
            $sample->map(fn ($t) => [
                $t->id,
                $t->project_id ?? '—',
                mb_strimwidth((string) $t->title, 0, 40, '…'),
                $t->updated_at,
            ])->all()
        );

        if ($total > $sample->count()) {
            $this->line('  … and ' . ($total - $sample->count()) . ' more.');
        }

        if ($dryRun) {
            $this->info('Dry run — nothing was written.');
            return self::SUCCESS;
        }

        if (! $this->option('force') && ! $this->confirm("Set completed_at = updated_at on these {$total} task(s)?")) {
            $this->info('Aborted.');
            return self::SUCCESS;
        }

        // Deliberately the query builder, not Eloquent:
        //  - the model's update() would also touch updated_at, destroying the very
        //    value being copied from;
        //  - the saving hook only stamps completed_at on a status *transition*,
        //    which is not what is happening here.
        // Only completed_at is written; updated_at is left exactly as it was.
        $updated = $affectedRows()->update([
            'completed_at' => DB::raw('updated_at'),
        ]);

        $this->info("Backfilled completed_at on {$updated} task(s).");

        $remaining = $affectedRows()->count();
        if ($remaining > 0) {
            $this->warn("{$remaining} task(s) still missing completed_at — re-run to pick up anything written meanwhile.");
        }

        return self::SUCCESS;
    }
}
