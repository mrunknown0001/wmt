<?php

namespace App\Observers;

use App\Models\Task;
use App\Services\TaskDelegationService;

class TaskObserver
{
    /**
     * Hand newly assigned work to a stand-in if the assignee is away.
     *
     * On saved rather than created so a task reassigned to someone mid-cover is
     * caught too. The service writes with saveQuietly(), so its own change does
     * not come back through here.
     */
    public function saved(Task $task): void
    {
        TaskDelegationService::capture($task);
    }

    public function deleted(Task $task): void
    {
        $task->subtasks()->withTrashed()->get()->each->delete();
    }

    public function restored(Task $task): void
    {
        $task->subtasks()->onlyTrashed()->restore();
    }
}
