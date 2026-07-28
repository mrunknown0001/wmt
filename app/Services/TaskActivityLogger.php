<?php

namespace App\Services;

use App\Models\Task;
use App\Models\TaskActivity;
use App\Models\User;

class TaskActivityLogger
{
    private const TRACKED_FIELDS = ['title', 'description', 'status', 'priority', 'assigned_to', 'due_date'];

    public static function logCreated(Task $task, ?User $user, ?string $description = null): void
    {
        TaskActivity::create([
            'task_id' => $task->id,
            'user_id' => $user?->id,
            'description' => $description ?? 'created the task',
        ]);
    }

    public static function logChanges(Task $task, array $oldValues, User $user): void
    {
        foreach (self::TRACKED_FIELDS as $field) {
            $oldVal = $oldValues[$field] ?? null;
            $newVal = $task->$field;

            // Normalize for comparison
            if ($field === 'due_date') {
                $oldVal = $oldVal ? (string) $oldVal : null;
                $newVal = $newVal ? $newVal->toDateString() : null;
            }

            if ($field === 'assigned_to') {
                $oldVal = $oldVal ?: null;
                $newVal = $newVal ?: null;
            }

            if ((string) $oldVal === (string) $newVal) {
                continue;
            }

            TaskActivity::create([
                'task_id' => $task->id,
                'user_id' => $user->id,
                'field' => $field,
                'old_value' => self::formatValue($field, $oldVal),
                'new_value' => self::formatValue($field, $newVal),
            ]);
        }
    }

    private static function formatValue(string $field, mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($field === 'assigned_to') {
            $user = User::find($value);
            return $user?->name ?? 'Unknown';
        }

        if (in_array($field, ['status', 'priority'])) {
            return ucwords(str_replace('_', ' ', $value));
        }

        // Descriptions are rich text. The activity row is capped at 255 chars, so
        // without stripping markup the snippet would be mostly tags rather than
        // anything the reader recognises.
        if ($field === 'description') {
            $text = html_entity_decode(strip_tags((string) $value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $text = trim(preg_replace('/\s+/u', ' ', $text));

            return $text === '' ? null : $text;
        }

        return (string) $value;
    }
}
