<?php

namespace App\Observers;

use App\Models\Department;
use App\Models\User;
use App\Services\FolderService;

class DepartmentObserver
{
    public function created(Department $department): void
    {
        FolderService::syncDepartment($department);
        $this->forgetHeadCache($department);
    }

    public function updated(Department $department): void
    {
        if ($department->wasChanged(['name', 'division_id'])) {
            FolderService::syncDepartment($department);
        }

        if ($department->wasChanged('head_id')) {
            $this->forgetHeadCache($department);
        }
    }

    public function deleted(Department $department): void
    {
        $department->teams()->withTrashed()->get()->each->delete();
        FolderService::removeFor(Department::class, $department->id);
        $this->forgetHeadCache($department);
    }

    /**
     * The "is this user an org head?" flag is cached and read on every request,
     * so both the outgoing and incoming head are invalidated — otherwise a
     * replaced head keeps the monitoring menu until the cache expires.
     */
    private function forgetHeadCache(Department $department): void
    {
        User::forgetOrgHeadCache($department->getOriginal('head_id'));
        User::forgetOrgHeadCache($department->head_id);
    }

    public function restored(Department $department): void
    {
        $department->teams()->onlyTrashed()->restore();
        FolderService::syncDepartment($department);
    }
}
