<?php

namespace App\Observers;

use App\Models\Department;
use App\Services\FolderService;

class DepartmentObserver
{
    public function created(Department $department): void
    {
        FolderService::syncDepartment($department);
    }

    public function updated(Department $department): void
    {
        if ($department->wasChanged(['name', 'division_id'])) {
            FolderService::syncDepartment($department);
        }
    }

    public function deleted(Department $department): void
    {
        FolderService::removeFor(Department::class, $department->id);
    }
}
