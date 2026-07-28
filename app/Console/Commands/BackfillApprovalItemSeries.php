<?php

namespace App\Console\Commands;

use App\Models\ApprovalItem;
use App\Models\ApprovalProject;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Give existing approval items a reference number.
 *
 * Numbering was added after these items were created, so they carry none. New
 * items get one on creation; this issues numbers for the history so a project
 * isn't split between numbered and unnumbered requests.
 *
 * Numbers are assigned in submission order (falling back to creation order),
 * so the oldest request gets the lowest number — matching how the list is
 * ordered and how someone would expect a reference series to read.
 */
class BackfillApprovalItemSeries extends Command
{
    protected $signature = 'approvals:backfill-series
                            {--project= : Limit to one approval project id}
                            {--dry-run : Report what would change without writing}
                            {--force : Skip the confirmation prompt}';

    protected $description = 'Assign reference numbers to approval items created before numbering existed';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $projects = ApprovalProject::query()
            ->whereNotNull('series_prefix')
            ->when($this->option('project'), fn ($q, $id) => $q->whereKey($id))
            ->get();

        if ($projects->isEmpty()) {
            $this->warn('No approval projects have a series prefix configured — nothing to number.');
            $this->line('Set a prefix on the project first, then re-run.');
            return self::SUCCESS;
        }

        $grandTotal = 0;

        foreach ($projects as $project) {
            $pending = ApprovalItem::query()
                ->where('approval_project_id', $project->id)
                ->whereNull('series_number')
                ->orderByRaw('submitted_at IS NULL')   // submitted ones first
                ->orderBy('submitted_at')
                ->orderBy('id')
                ->get(['id', 'title', 'submitted_at']);

            if ($pending->isEmpty()) {
                continue;
            }

            $this->line('');
            $this->info("{$project->name} — {$pending->count()} unnumbered item(s), prefix {$project->series_prefix}");

            $preview = $pending->take(5);
            $sequence = max(1, (int) $project->series_next);

            foreach ($preview as $i => $item) {
                $this->line(sprintf(
                    '   %s  %s',
                    $project->formatSeries($sequence + $i),
                    mb_strimwidth((string) $item->title, 0, 50, '…')
                ));
            }
            if ($pending->count() > $preview->count()) {
                $this->line('   … and ' . ($pending->count() - $preview->count()) . ' more');
            }

            $grandTotal += $pending->count();

            if ($dryRun) {
                continue;
            }

            if (! $this->option('force') && ! $this->confirm("Number these {$pending->count()} item(s)?", true)) {
                $this->line('   skipped');
                continue;
            }

            // The counter is advanced inside the same transaction as the writes so
            // an item created while this runs cannot be handed a number this
            // backfill is about to use.
            DB::transaction(function () use ($project, $pending) {
                $locked = ApprovalProject::whereKey($project->id)->lockForUpdate()->first();
                $sequence = max(1, (int) $locked->series_next);

                foreach ($pending as $item) {
                    ApprovalItem::whereKey($item->id)->update([
                        'series_number' => $locked->formatSeries($sequence),
                        'series_sequence' => $sequence,
                    ]);
                    $sequence++;
                }

                $locked->series_next = $sequence;
                $locked->saveQuietly();
            });

            $this->info("   numbered {$pending->count()} item(s)");
        }

        if ($grandTotal === 0) {
            $this->info('Every item in the configured projects already has a number.');
            return self::SUCCESS;
        }

        $this->line('');
        $this->info($dryRun
            ? "Dry run — {$grandTotal} item(s) would be numbered."
            : "Done — {$grandTotal} item(s) processed.");

        return self::SUCCESS;
    }
}
