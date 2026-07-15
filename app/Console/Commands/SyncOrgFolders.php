<?php

namespace App\Console\Commands;

use App\Models\Department;
use App\Models\Division;
use App\Models\Team;
use App\Services\FolderService;
use Illuminate\Console\Command;

class SyncOrgFolders extends Command
{
    protected $signature = 'folders:sync';

    protected $description = 'Create or update system folders for all divisions, departments, and teams';

    public function handle(): int
    {
        Division::query()->each(fn (Division $d) => FolderService::syncDivision($d));
        Department::query()->with('division')->each(fn (Department $d) => FolderService::syncDepartment($d));
        Team::query()->with('department.division')->each(fn (Team $t) => FolderService::syncTeam($t));

        $this->info('Org folders synced.');

        return self::SUCCESS;
    }
}
