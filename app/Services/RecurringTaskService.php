<?php

namespace App\Services;

use App\Models\Task;
use App\Models\TaskActivity;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;

class RecurringTaskService
{
    public static function generateNextIfCompleted(Task $task, ?string $oldStatus, User $actor): ?Task
    {
        if ($task->status !== 'done') {
            return null;
        }

        if ($oldStatus === 'done') {
            return null;
        }

        if (!$task->is_recurring) {
            return null;
        }

        if ($task->recurringNext()->exists()) {
            return null;
        }

        return self::createNextOccurrence($task, $actor);
    }

    private static function createNextOccurrence(Task $task, User $actor): Task
    {
        $nextDueDate = $task->calculateNextDueDate();

        $maxPosition = Task::where('project_id', $task->project_id)
            ->whereNull('parent_id')
            ->where('status', 'to_do')
            ->max('position') ?? -1;

        $newTask = Task::create([
            'project_id' => $task->project_id,
            'title' => $task->title,
            'description' => $task->description,
            'status' => 'to_do',
            'priority' => $task->priority,
            'assigned_to' => $task->assigned_to,
            'created_by' => $actor->id,
            'due_date' => $nextDueDate,
            'position' => $maxPosition + 1,
            'is_recurring' => true,
            'recurrence_frequency' => $task->recurrence_frequency,
            'recurrence_interval' => $task->recurrence_interval,
            'recurring_source_id' => $task->id,
        ]);

        $collaboratorIds = $task->collaborators()->pluck('users.id')->toArray();
        if (!empty($collaboratorIds)) {
            $newTask->collaborators()->sync($collaboratorIds);
        }

        TaskActivityLogger::logCreated($newTask, $actor);

        TaskActivity::create([
            'task_id' => $task->id,
            'user_id' => $actor->id,
            'description' => 'generated next recurring occurrence',
        ]);

        if ($newTask->assigned_to && $newTask->assigned_to !== $actor->id) {
            $newTask->load('project', 'assignee');
            $newTask->assignee->notify(new TaskAssignedNotification($newTask, $actor));
        }

        return $newTask;
    }
}
