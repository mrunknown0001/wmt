<?php

namespace App\Services;

use App\Models\Task;
use App\Models\TaskActivity;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
use App\Services\CustomFieldDefaults;

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

        // Shift start_date by the same offset to preserve task duration
        $nextStartDate = null;
        if ($task->start_date) {
            if ($task->due_date && $nextDueDate) {
                $duration = $task->start_date->diffInDays($task->due_date);
                $nextStartDate = $nextDueDate->copy()->subDays($duration);
            } else {
                // No due_date, just shift start_date by recurrence interval
                $nextStartDate = match ($task->recurrence_frequency) {
                    'daily' => $task->start_date->copy()->addDays($task->recurrence_interval),
                    'weekly' => $task->start_date->copy()->addWeeks($task->recurrence_interval),
                    'monthly' => $task->start_date->copy()->addMonths($task->recurrence_interval),
                    'yearly' => $task->start_date->copy()->addYears($task->recurrence_interval),
                    default => null,
                };
            }
        }

        // Position is measured among the task's own siblings — a recurring subtask
        // belongs under its parent, not at the top level of the project.
        $positionQuery = Task::where('status', 'to_do');
        if ($task->parent_id) {
            $positionQuery->where('parent_id', $task->parent_id);
        } else {
            $positionQuery->whereNull('parent_id');
        }
        if ($task->project_id) {
            $positionQuery->where('project_id', $task->project_id);
        } else {
            $positionQuery->whereNull('project_id');
        }
        $maxPosition = $positionQuery->max('position') ?? -1;

        $newTask = Task::create([
            'project_id' => $task->project_id,
            // Placement carries over: without these the next occurrence appeared in
            // Unsectioned, and a recurring subtask was reborn as a top-level task.
            'section_id' => $task->section_id,
            'parent_id' => $task->parent_id,
            'title' => $task->title,
            'description' => $task->description,
            'status' => 'to_do',
            'priority' => $task->priority,
            'assigned_to' => $task->assigned_to,
            'created_by' => $actor->id,
            'start_date' => $nextStartDate,
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

        // Carry the custom field values forward. Every value column is copied
        // rather than a chosen few, so field types added later come along without
        // this needing to change.
        $task->loadMissing('customFieldValues');
        $carried = [];

        foreach ($task->customFieldValues as $cfv) {
            $newTask->customFieldValues()->create([
                'custom_field_id' => $cfv->custom_field_id,
                'value_text' => $cfv->value_text,
                'value_number' => $cfv->value_number,
                'value_date' => $cfv->value_date,
                'value_json' => $cfv->value_json,
                'value_option_id' => $cfv->value_option_id,
            ]);
            $carried[] = $cfv->custom_field_id;
        }

        // Fields the previous occurrence never held fall back to their default,
        // the same as any other newly created task. Carried values are passed as
        // "already provided" so a default can't overwrite one.
        CustomFieldDefaults::apply($newTask, $carried);

        TaskActivityLogger::logCreated($newTask, $actor);
        ActivityLogger::logCreated($newTask, $actor);

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
