<?php

namespace App\Console\Commands;

use App\Models\Division;
use App\Models\Department;
use App\Models\Team;
use App\Models\User;
use App\Models\Project;
use App\Models\Task;
use App\Models\Link;
use App\Models\Folder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class PurgeTrash extends Command
{
    protected $signature = 'trash:purge {--dry-run : Show what would be deleted without actually deleting}';

    protected $description = 'Permanently delete trashed items older than 30 days';

    private const TYPES = [
        'Divisions' => Division::class,
        'Departments' => Department::class,
        'Teams' => Team::class,
        'Users' => User::class,
        'Projects' => Project::class,
        'Tasks' => Task::class,
        'Links' => Link::class,
        'Folders' => Folder::class,
    ];

    public function handle(): int
    {
        $retentionDays = 30;
        $cutoffDate = now()->subDays($retentionDays);
        $dryRun = $this->option('dry-run');

        if ($dryRun) {
            $this->warn("DRY RUN — no items will be deleted.");
        }

        $this->info("Purging trashed items older than {$retentionDays} days (before {$cutoffDate->toDateString()})...");

        $totalCount = 0;

        foreach (self::TYPES as $typeName => $modelClass) {
            $count = $this->purgeModel($modelClass, $typeName, $cutoffDate, $dryRun);
            if ($count > 0) {
                $this->info("  {$typeName}: {$count} items purged");
            }
            $totalCount += $count;
        }

        $action = $dryRun ? 'would be purged' : 'purged';
        $this->info("Done. {$totalCount} items {$action}.");

        if (!$dryRun && $totalCount > 0) {
            Log::info("Trash purge completed: {$totalCount} items permanently deleted.");
        }

        return self::SUCCESS;
    }

    private function purgeModel(string $modelClass, string $typeName, $cutoffDate, bool $dryRun): int
    {
        $count = 0;

        $modelClass::onlyTrashed()
            ->where('deleted_at', '<=', $cutoffDate)
            ->chunkById(100, function ($items) use ($dryRun, &$count) {
                foreach ($items as $item) {
                    if (!$dryRun) {
                        $item->forceDelete();
                    }
                    $count++;
                }
            });

        return $count;
    }
}
