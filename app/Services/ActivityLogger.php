<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\Department;
use App\Models\Division;
use App\Models\Folder;
use App\Models\TaskSection;
use App\Models\Team;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class ActivityLogger
{
    private const ENTITY_MAP = [
        \App\Models\Project::class     => ['type' => 'project',      'name_field' => 'name'],
        \App\Models\Task::class        => ['type' => 'task',         'name_field' => 'title'],
        \App\Models\User::class        => ['type' => 'user',         'name_field' => 'name'],
        \App\Models\Division::class    => ['type' => 'division',     'name_field' => 'name'],
        \App\Models\Department::class  => ['type' => 'department',   'name_field' => 'name'],
        \App\Models\Team::class        => ['type' => 'team',         'name_field' => 'name'],
        \App\Models\TaskSection::class => ['type' => 'task_section', 'name_field' => 'name'],
        \App\Models\Folder::class      => ['type' => 'folder',       'name_field' => 'name'],
    ];

    private const TRACKED_FIELDS = [
        'project'      => ['name', 'description', 'status', 'owner_id', 'folder_id', 'due_date'],
        'task'         => ['title', 'description', 'status', 'priority', 'assigned_to', 'due_date', 'start_date', 'section_id'],
        'user'         => ['name', 'email', 'position', 'department_id', 'team_id', 'is_active'],
        'division'     => ['name', 'description', 'head_id'],
        'department'   => ['name', 'description', 'division_id', 'head_id'],
        'team'         => ['name', 'description', 'department_id', 'leader_id'],
        'task_section' => ['name'],
        'folder'       => ['name', 'parent_id'],
    ];

    public static function logCreated(Model $entity, ?User $user, ?string $description = null): void
    {
        $meta = self::getMeta($entity);
        if (!$meta) return;

        $name = $entity->{$meta['name_field']} ?? '(unnamed)';

        ActivityLog::create([
            'user_id'     => $user?->id,
            'entity_type' => $meta['type'],
            'entity_id'   => $entity->id,
            'entity_name' => $name,
            'action'      => 'created',
            'description' => $description ?? "created {$meta['type']} \"{$name}\"",
        ]);
    }

    public static function logChanges(Model $entity, array $oldValues, User $user): void
    {
        $meta = self::getMeta($entity);
        if (!$meta) return;

        $trackedFields = self::TRACKED_FIELDS[$meta['type']] ?? [];
        $entityName = $entity->{$meta['name_field']} ?? '(unnamed)';

        foreach ($trackedFields as $field) {
            $oldVal = $oldValues[$field] ?? null;
            $newVal = $entity->$field;

            // Normalize date fields
            if (str_contains($field, 'date')) {
                $oldVal = $oldVal ? (string) $oldVal : null;
                $newVal = $newVal ? (is_string($newVal) ? $newVal : $newVal->toDateString()) : null;
            }

            // Normalize booleans
            if (is_bool($newVal)) {
                $oldVal = (bool) $oldVal;
                if ($oldVal === $newVal) continue;
            }

            // Normalize nullable FK fields
            $oldVal = $oldVal ?: null;
            $newVal = $newVal ?: null;

            if ((string) $oldVal === (string) $newVal) {
                continue;
            }

            ActivityLog::create([
                'user_id'     => $user->id,
                'entity_type' => $meta['type'],
                'entity_id'   => $entity->id,
                'entity_name' => $entityName,
                'action'      => 'updated',
                'field'       => $field,
                'old_value'   => self::formatValue($field, $oldVal),
                'new_value'   => self::formatValue($field, $newVal),
            ]);
        }
    }

    public static function logDeleted(Model $entity, User $user): void
    {
        $meta = self::getMeta($entity);
        if (!$meta) return;

        $name = $entity->{$meta['name_field']} ?? '(unnamed)';

        ActivityLog::create([
            'user_id'     => $user->id,
            'entity_type' => $meta['type'],
            'entity_id'   => $entity->id,
            'entity_name' => $name,
            'action'      => 'deleted',
            'description' => "deleted {$meta['type']} \"{$name}\"",
        ]);
    }

    private static function getMeta(Model $entity): ?array
    {
        return self::ENTITY_MAP[get_class($entity)] ?? null;
    }

    private static function formatValue(string $field, mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (in_array($field, ['assigned_to', 'owner_id', 'head_id', 'leader_id', 'created_by'])) {
            return User::find($value)?->name ?? 'Unknown';
        }

        if ($field === 'department_id') {
            return Department::find($value)?->name ?? 'Unknown';
        }

        if ($field === 'team_id') {
            return Team::find($value)?->name ?? 'Unknown';
        }

        if ($field === 'division_id') {
            return Division::find($value)?->name ?? 'Unknown';
        }

        if ($field === 'section_id') {
            return TaskSection::find($value)?->name ?? 'Unknown';
        }

        if (in_array($field, ['folder_id', 'parent_id'])) {
            return Folder::find($value)?->name ?? 'Unknown';
        }

        if (in_array($field, ['status', 'priority'])) {
            return ucwords(str_replace('_', ' ', $value));
        }

        if ($field === 'is_active') {
            return $value ? 'Active' : 'Inactive';
        }

        return (string) $value;
    }
}
