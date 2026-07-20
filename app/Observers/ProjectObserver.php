<?php

namespace App\Observers;

use App\Models\Project;

class ProjectObserver
{
    public function deleted(Project $project): void
    {
        $project->tasks()->withTrashed()->get()->each->delete();
    }

    public function restored(Project $project): void
    {
        $project->tasks()->onlyTrashed()->restore();
    }
}
