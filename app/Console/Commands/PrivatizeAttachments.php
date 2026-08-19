<?php

namespace App\Console\Commands;

use App\Models\ApprovalCommentAttachment;
use App\Models\ApprovalItemAttachment;
use App\Models\CommentAttachment;
use App\Models\TaskAttachment;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * One-off migration for deployments that uploaded attachments before they moved
 * to the private disk.
 *
 * Only the disk root changes — the stored file_path is identical on both sides —
 * so nothing in the database needs rewriting. Run it once after deploying; it is
 * safe to run again, as already-moved files are skipped.
 */
class PrivatizeAttachments extends Command
{
    protected $signature = 'attachments:privatize
                            {--dry-run : Report what would move without touching any file}';

    protected $description = 'Move existing attachments off the public disk onto the private attachments disk';

    /** Every model whose files used to live on the public disk. */
    private const MODELS = [
        TaskAttachment::class,
        CommentAttachment::class,
        ApprovalItemAttachment::class,
        ApprovalCommentAttachment::class,
    ];

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $public = Storage::disk('public');

        $moved = $skipped = $missing = 0;

        foreach (self::MODELS as $modelClass) {
            $target = $modelClass::disk();
            $label = class_basename($modelClass);

            $modelClass::query()->chunkById(100, function ($attachments) use (
                $public, $target, $label, $dryRun, &$moved, &$skipped, &$missing
            ) {
                foreach ($attachments as $attachment) {
                    $path = $attachment->file_path;

                    // Already private — a re-run, or uploaded after the change.
                    if ($target->exists($path)) {
                        $skipped++;
                        continue;
                    }

                    if (!$public->exists($path)) {
                        $missing++;
                        $this->warn("  {$label} #{$attachment->id}: file not found on either disk ({$path})");
                        continue;
                    }

                    if ($dryRun) {
                        $this->line("  would move {$label} #{$attachment->id}: {$path}");
                        $moved++;
                        continue;
                    }

                    // Streamed rather than read into memory — attachments run to
                    // 100MB (videos), and this walks every row in the table.
                    $stream = $public->readStream($path);

                    if ($stream === null || $target->writeStream($path, $stream) === false) {
                        if (is_resource($stream)) {
                            fclose($stream);
                        }

                        $this->error("  {$label} #{$attachment->id}: copy failed ({$path}) — left in place");
                        continue;
                    }

                    if (is_resource($stream)) {
                        fclose($stream);
                    }

                    // Source is only removed once the copy is known to be there,
                    // so an interrupted run never loses a file.
                    $public->delete($path);
                    $moved++;
                }
            });
        }

        $verb = $dryRun ? 'would move' : 'moved';
        $this->info("Done. {$verb} {$moved}, already private {$skipped}, missing {$missing}.");

        if ($missing > 0) {
            $this->warn('Rows reported missing have no file on either disk — most likely purged already.');
        }

        return self::SUCCESS;
    }
}
