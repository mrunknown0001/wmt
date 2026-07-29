<?php

namespace App\Observers;

use App\Models\Team;
use App\Models\User;
use App\Services\FolderService;

class TeamObserver
{
    public function created(Team $team): void
    {
        FolderService::syncTeam($team);
        $this->forgetLeaderCache($team);
    }

    public function updated(Team $team): void
    {
        if ($team->wasChanged(['name', 'department_id'])) {
            FolderService::syncTeam($team);
        }

        if ($team->wasChanged('leader_id')) {
            $this->forgetLeaderCache($team);
        }
    }

    public function deleted(Team $team): void
    {
        FolderService::removeFor(Team::class, $team->id);
        $this->forgetLeaderCache($team);
    }

    /**
     * The "is this user an org head?" flag is cached and read on every request,
     * so both the outgoing and incoming leader are invalidated — otherwise a
     * replaced leader keeps the monitoring menu until the cache expires.
     */
    private function forgetLeaderCache(Team $team): void
    {
        User::forgetOrgHeadCache($team->getOriginal('leader_id'));
        User::forgetOrgHeadCache($team->leader_id);
    }

    public function restored(Team $team): void
    {
        FolderService::syncTeam($team);
    }
}
