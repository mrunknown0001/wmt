<?php

namespace App\Services;

use App\Models\CustomField;
use App\Models\Task;
use App\Services\TaskDependencyService;
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

    /**
     * Custom fields in this project that have a usable default configured.
     *
     * Mirrors the emptiness test in CustomFieldDefaults so the two agree on what
     * counts as "has a default" — otherwise a field could be skipped here and
     * then not filled there, leaving it blank.
     */
    private static function fieldIdsWithDefaults(?int $projectId): array
    {
        if (!$projectId) {
            return [];
        }

        return CustomField::where('project_id', $projectId)
            ->where('type', '!=', 'formula')
            ->whereNotNull('config')
            ->get(['id', 'config'])
            ->filter(function ($field) {
                $default = $field->config['default_value'] ?? null;

                return $default !== null && $default !== '' && !(is_array($default) && empty($default));
            })
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
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
                    'semi_annual' => $task->start_date->copy()
                        ->addMonths($task->recurrence_interval * Task::MONTHS_PER_SEMI_ANNUAL),
                    'yearly' => $task->start_date->copy()->addYears($task->recurrence_interval),
                    default => null,
                };
            }
        }

        // The occurrence takes over the slot its predecessor just vacated, rather
        // than being appended to the end of the list. A weekly task that lives
        // near the top of its section should still be there next week — pushing
        // it to the bottom each cycle buries recurring work under everything else.
        //
        // The predecessor keeps its own position value, but it has just moved to
        // "done", so it is no longer ordered against the open tasks.
        $position = $task->position ?? 0;

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
            'due_time' => $task->due_time,
            'position' => $position,
            'is_recurring' => true,
            'recurrence_frequency' => $task->recurrence_frequency,
            'recurrence_interval' => $task->recurrence_interval,
            'recurrence_config' => $task->recurrence_config,
            'recurring_source_id' => $task->id,
        ]);

        $collaboratorIds = $task->collaborators()->pluck('users.id')->toArray();
        if (!empty($collaboratorIds)) {
            $newTask->collaborators()->sync($collaboratorIds);
        }

        // A recurring task that waits on something waits on it every cycle, so
        // the edges come along. The helper skips any edge that would point the
        // new occurrence at the one it replaces.
        TaskDependencyService::copyTo($task, $newTask);

        // Custom fields on a new occurrence:
        //
        //   - a field with a default value is reset to that default. A default is
        //     what the field should start each cycle as, so carrying last cycle's
        //     answer over the top of it would make the setting meaningless.
        //   - a field with no default carries its previous value, so context that
        //     has nowhere else to come from isn't lost.
        //
        // Every value column is copied rather than a chosen few, so field types
        // added later come along without this needing to change.
        $task->loadMissing('customFieldValues');

        $defaulted = self::fieldIdsWithDefaults($task->project_id);
        $carried = [];

        foreach ($task->customFieldValues as $cfv) {
            if (in_array((int) $cfv->custom_field_id, $defaulted, true)) {
                continue; // the default below owns this field
            }

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

        // Carried values are passed as "already provided" so a default can't
        // overwrite one — only the fields skipped above get defaults.
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
