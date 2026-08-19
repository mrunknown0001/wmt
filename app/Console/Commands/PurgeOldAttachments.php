<?php

namespace App\Console\Commands;

use App\Models\CommentAttachment;
use App\Models\Setting;
use App\Models\TaskAttachment;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class PurgeOldAttachments extends Command
{
    protected $signature = 'attachments:purge {--dry-run : Show what would be deleted without actually deleting}';

    protected $description = 'Purge attachments older than the configured retention period';

    public function handle(): int
    {
        $settings = Setting::current();

        if (! $settings->attachment_retention_enabled) {
            $this->info('Attachment retention is disabled. Skipping purge.');

            return self::SUCCESS;
        }

        $retentionDays = $settings->attachment_retention_days;
        $cutoffDate = now()->subDays($retentionDays);
        $dryRun = $this->option('dry-run');

        if ($dryRun) {
            $this->warn("DRY RUN — no files will be deleted.");
        }

        $this->info("Purging attachments older than {$retentionDays} days (before {$cutoffDate->toDateString()})...");

        $taskCount = $this->purgeModel(TaskAttachment::class, $cutoffDate, $dryRun);
        $commentCount = $this->purgeModel(CommentAttachment::class, $cutoffDate, $dryRun);

        $total = $taskCount + $commentCount;
        $action = $dryRun ? 'would be purged' : 'purged';

        $this->info("Done. {$total} attachments {$action} ({$taskCount} task, {$commentCount} comment).");

        if (! $dryRun && $total > 0) {
            Log::info("Attachment purge completed: {$total} files removed ({$taskCount} task, {$commentCount} comment).");
        }

        return self::SUCCESS;
    }

    private function purgeModel(string $modelClass, $cutoffDate, bool $dryRun): int
    {
        $count = 0;
        $disk = $modelClass::disk();

        $modelClass::where('created_at', '<', $cutoffDate)
            ->chunkById(100, function ($attachments) use ($disk, $dryRun, &$count) {
                foreach ($attachments as $attachment) {
                    if (! $dryRun) {
                        if ($disk->exists($attachment->file_path)) {
                            $disk->delete($attachment->file_path);
                        }
                        $attachment->delete();
                    }
                    $count++;
                }
            });

        return $count;
    }
}
