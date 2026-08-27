<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Say something when queued work has started failing.
 *
 * A failed job is silent by design: the queue records it and carries on, so a
 * notification that stops being delivered looks exactly like one nobody sent.
 * Six TaskDelegationNotification failures sat unnoticed on production for weeks
 * before anyone went looking.
 *
 * Deliberately counts only the last day rather than comparing against a stored
 * baseline. A baseline in the cache would report a phantom reset whenever the
 * cache was flushed, and a baseline in the database is one more thing to keep
 * true. "What failed since yesterday" needs no state and cannot drift.
 */
class ReportFailedJobs extends Command
{
    protected $signature = 'queue:report-failed {--hours=24 : How far back to look}';

    protected $description = 'Warn in the log when queued jobs have failed recently';

    public function handle(): int
    {
        $hours = max(1, (int) $this->option('hours'));
        $since = now()->subHours($hours);

        $recent = DB::table('failed_jobs')->where('failed_at', '>=', $since)->get();

        if ($recent->isEmpty()) {
            // Nothing to say. Logged at info so it is absent from production,
            // which runs at warning — a healthy queue should not write a line a
            // day that someone has to learn to ignore.
            $this->info("No queued jobs have failed in the last {$hours}h.");
            Log::info('[queue] No jobs failed in the last ' . $hours . 'h.');

            return self::SUCCESS;
        }

        // Group by what failed, so the log line names the culprit rather than
        // only a number.
        $byJob = $recent
            ->groupBy(fn ($row) => json_decode($row->payload, true)['displayName'] ?? 'unknown')
            ->map->count()
            ->sortDesc();

        $summary = $byJob->map(fn ($n, $name) => "{$name} ×{$n}")->implode(', ');

        Log::warning("[queue] {$recent->count()} job(s) failed in the last {$hours}h: {$summary}", [
            'total_failed_rows' => DB::table('failed_jobs')->count(),
            'window_hours' => $hours,
        ]);

        $this->warn("{$recent->count()} job(s) failed in the last {$hours}h: {$summary}");

        return self::SUCCESS;
    }
}
