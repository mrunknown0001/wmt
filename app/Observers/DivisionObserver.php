<?php

namespace App\Observers;

use App\Models\Division;
use App\Models\User;
use App\Services\FolderService;

class DivisionObserver
{
    public function created(Division $division): void
    {
        FolderService::syncDivision($division);
        $this->forgetHeadCache($division);
    }

    public function updated(Division $division): void
    {
        if ($division->wasChanged('name')) {
            FolderService::syncDivision($division);
        }

        if ($division->wasChanged('head_id')) {
            $this->forgetHeadCache($division);
        }
    }

    public function deleted(Division $division): void
    {
        $division->departments()->withTrashed()->get()->each->delete();
        FolderService::removeFor(Division::class, $division->id);
        $this->forgetHeadCache($division);
    }

    /**
     * The "is this user an org head?" flag is cached and read on every request,
     * so both the outgoing and incoming head are invalidated — otherwise a
     * replaced head keeps the monitoring menu until the cache expires.
     */
    private function forgetHeadCache(Division $division): void
    {
        User::forgetOrgHeadCache($division->getOriginal('head_id'));
        User::forgetOrgHeadCache($division->head_id);
    }

    public function restored(Division $division): void
    {
        $division->departments()->onlyTrashed()->restore();
        FolderService::syncDivision($division);
    }
}
