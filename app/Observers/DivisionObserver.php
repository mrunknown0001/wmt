<?php

namespace App\Observers;

use App\Models\Division;
use App\Services\FolderService;

class DivisionObserver
{
    public function created(Division $division): void
    {
        FolderService::syncDivision($division);
    }

    public function updated(Division $division): void
    {
        if ($division->wasChanged('name')) {
            FolderService::syncDivision($division);
        }
    }

    public function deleted(Division $division): void
    {
        $division->departments()->withTrashed()->get()->each->delete();
        FolderService::removeFor(Division::class, $division->id);
    }

    public function restored(Division $division): void
    {
        $division->departments()->onlyTrashed()->restore();
        FolderService::syncDivision($division);
    }
}
