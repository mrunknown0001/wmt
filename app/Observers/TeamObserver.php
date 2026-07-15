<?php

namespace App\Observers;

use App\Models\Team;
use App\Services\FolderService;

class TeamObserver
{
    public function created(Team $team): void
    {
        FolderService::syncTeam($team);
    }

    public function updated(Team $team): void
    {
        if ($team->wasChanged(['name', 'department_id'])) {
            FolderService::syncTeam($team);
        }
    }

    public function deleted(Team $team): void
    {
        FolderService::removeFor(Team::class, $team->id);
    }
}
