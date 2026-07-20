<?php

namespace App\Observers;

use App\Models\Task;

class TaskObserver
{
    public function deleted(Task $task): void
    {
        $task->subtasks()->withTrashed()->get()->each->delete();
    }

    public function restored(Task $task): void
    {
        $task->subtasks()->onlyTrashed()->restore();
    }
}
