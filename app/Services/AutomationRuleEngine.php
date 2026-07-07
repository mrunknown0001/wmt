<?php

namespace App\Services;

use App\Events\AutomationRuleExecuted;
use App\Events\TaskUpdated;
use App\Models\CustomField;
use App\Models\ProjectAutomationRule;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\TaskCustomFieldValue;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
use Carbon\Carbon;

class AutomationRuleEngine
{
    private static bool $executing = false;

    public static function evaluate(Task $task, string $triggerType, array $oldValues = []): void
    {
        // Guard against infinite loops — don't re-trigger rules from rule-caused changes
        if (self::$executing) {
            return;
        }

        // Skip automation for standalone tasks (rules are project-scoped)
        if (! $task->project_id) {
            return;
        }

        $rules = ProjectAutomationRule::where('project_id', $task->project_id)
            ->where('is_active', true)
            ->where('trigger_type', $triggerType)
            ->get();

        if ($rules->isEmpty()) {
            return;
        }

        self::$executing = true;

        try {
            foreach ($rules as $rule) {
                if (self::conditionsMet($task, $rule->conditions)) {
                    self::executeActions($task, $rule->actions);

                    // Refresh and broadcast the updated task for real-time UI sync
                    $task->refresh();
                    $task->load('assignee', 'collaborators');

                    broadcast(new TaskUpdated(
                        $task->project_id,
                        $task->toArray(),
                        'updated',
                        auth()->id() ?? $task->created_by ?? 0,
                    ));

                    // Broadcast automation rule execution for toast notifications
                    $actionSummaries = collect($rule->actions)->map(fn ($a) => $a['type'] ?? 'unknown')->all();
                    broadcast(new AutomationRuleExecuted(
                        $task->project_id,
                        $rule->name,
                        ['id' => $task->id, 'title' => $task->title],
                        $actionSummaries,
                    ));
                }
            }
        } finally {
            self::$executing = false;
        }
    }

    private static function conditionsMet(Task $task, ?array $conditions): bool
    {
        if (empty($conditions)) {
            return true;
        }

        // Eagerly load custom field values if any condition references custom fields
        $hasCustomFieldCondition = collect($conditions)->contains(fn ($c) => ($c['field'] ?? null) === 'custom_field');
        if ($hasCustomFieldCondition) {
            $task->loadMissing('customFieldValues.customField');
        }

        foreach ($conditions as $condition) {
            $field = $condition['field'] ?? null;
            $operator = $condition['operator'] ?? 'equals';
            $value = $condition['value'] ?? null;

            if (!$field) continue;

            if ($field === 'custom_field') {
                $met = self::evaluateCustomFieldCondition($task, $condition);
            } else {
                $taskValue = $task->getAttribute($field);

                // Normalize for comparison
                $taskValue = is_null($taskValue) ? null : (string) $taskValue;
                $value = is_null($value) ? null : (string) $value;

                $met = match ($operator) {
                    'equals' => $taskValue === $value,
                    'not_equals' => $taskValue !== $value,
                    'in' => is_array($condition['value']) && in_array($taskValue, array_map('strval', $condition['value'])),
                    'not_in' => is_array($condition['value']) && !in_array($taskValue, array_map('strval', $condition['value'])),
                    default => true,
                };
            }

            if (!$met) {
                return false;
            }
        }

        return true;
    }

    private static function evaluateCustomFieldCondition(Task $task, array $condition): bool
    {
        $customFieldId = $condition['custom_field_id'] ?? null;
        if (!$customFieldId) return true;

        $cfv = $task->customFieldValues->firstWhere('custom_field_id', $customFieldId);
        $customField = $cfv?->customField;

        // If no custom field value record exists, try to find the field definition directly
        if (!$customField) {
            $customField = CustomField::where('id', $customFieldId)
                ->where('project_id', $task->project_id)
                ->first();
        }

        $currentValue = $cfv?->value;
        $operator = $condition['operator'] ?? 'equals';

        // Handle is_empty / is_not_empty (type-agnostic)
        if ($operator === 'is_empty') {
            return $currentValue === null || $currentValue === '' || (is_array($currentValue) && empty($currentValue));
        }
        if ($operator === 'is_not_empty') {
            return $currentValue !== null && $currentValue !== '' && !(is_array($currentValue) && empty($currentValue));
        }

        if (!$customField) return false;

        $conditionValue = $condition['value'] ?? null;

        return match ($customField->type) {
            'text', 'textarea' => self::evaluateTextCondition($currentValue, $operator, $conditionValue),
            'number' => self::evaluateNumberCondition($currentValue, $operator, $conditionValue),
            'date' => self::evaluateDateCondition($currentValue, $operator, $conditionValue),
            'single_select' => self::evaluateSelectCondition($currentValue, $operator, $conditionValue, $condition),
            'multi_select' => self::evaluateMultiSelectCondition($currentValue, $operator, $conditionValue, $condition),
            default => true,
        };
    }

    private static function evaluateTextCondition($value, string $operator, $expected): bool
    {
        $value = (string) ($value ?? '');
        $expected = (string) ($expected ?? '');

        return match ($operator) {
            'equals' => $value === $expected,
            'not_equals' => $value !== $expected,
            'contains' => str_contains($value, $expected),
            default => true,
        };
    }

    private static function evaluateNumberCondition($value, string $operator, $expected): bool
    {
        if ($value === null || $value === '') return false;

        $value = (float) $value;
        $expected = (float) ($expected ?? 0);

        return match ($operator) {
            'equals' => $value == $expected,
            'not_equals' => $value != $expected,
            'greater_than' => $value > $expected,
            'less_than' => $value < $expected,
            default => true,
        };
    }

    private static function evaluateDateCondition($value, string $operator, $expected): bool
    {
        if ($value === null || $value === '') return false;

        try {
            $date = Carbon::parse($value);
            $expectedDate = Carbon::parse($expected);
        } catch (\Exception) {
            return false;
        }

        return match ($operator) {
            'equals' => $date->isSameDay($expectedDate),
            'not_equals' => !$date->isSameDay($expectedDate),
            'before' => $date->isBefore($expectedDate),
            'after' => $date->isAfter($expectedDate),
            default => true,
        };
    }

    private static function evaluateSelectCondition($value, string $operator, $expected, array $condition): bool
    {
        // For single_select, value is the option_id
        $currentId = $value !== null ? (string) $value : null;
        $expectedId = $expected !== null ? (string) $expected : null;

        return match ($operator) {
            'equals' => $currentId === $expectedId,
            'not_equals' => $currentId !== $expectedId,
            'in' => is_array($condition['value']) && in_array($currentId, array_map('strval', $condition['value'])),
            'not_in' => is_array($condition['value']) && !in_array($currentId, array_map('strval', $condition['value'])),
            default => true,
        };
    }

    private static function evaluateMultiSelectCondition($value, string $operator, $expected, array $condition): bool
    {
        // For multi_select, value is a JSON array of option IDs
        $currentIds = is_array($value) ? array_map('strval', $value) : [];

        return match ($operator) {
            'contains' => is_array($condition['value'])
                ? !empty(array_intersect(array_map('strval', $condition['value']), $currentIds))
                : in_array((string) $expected, $currentIds),
            'not_contains' => is_array($condition['value'])
                ? empty(array_intersect(array_map('strval', $condition['value']), $currentIds))
                : !in_array((string) $expected, $currentIds),
            default => true,
        };
    }

    private static function executeActions(Task $task, array $actions): void
    {
        foreach ($actions as $action) {
            $type = $action['type'] ?? null;
            $params = $action['params'] ?? [];

            match ($type) {
                'change_status' => self::actionChangeStatus($task, $params),
                'change_priority' => self::actionChangePriority($task, $params),
                'assign_user' => self::actionAssignUser($task, $params),
                'move_to_section' => self::actionMoveToSection($task, $params),
                'send_notification' => self::actionSendNotification($task, $params),
                'add_comment' => self::actionAddComment($task, $params),
                'set_custom_field' => self::actionSetCustomField($task, $params),
                default => null,
            };
        }
    }

    private static function actionChangeStatus(Task $task, array $params): void
    {
        $status = $params['status'] ?? null;
        if (!$status || $task->status === $status) return;

        $validStatuses = ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'];
        if (!in_array($status, $validStatuses)) return;

        $task->update(['status' => $status]);
    }

    private static function actionChangePriority(Task $task, array $params): void
    {
        $priority = $params['priority'] ?? null;
        if (!$priority || $task->priority === $priority) return;

        $validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (!in_array($priority, $validPriorities)) return;

        $task->update(['priority' => $priority]);
    }

    private static function actionAssignUser(Task $task, array $params): void
    {
        $userId = $params['user_id'] ?? null;
        if (!$userId || $task->assigned_to == $userId) return;

        $user = User::where('id', $userId)->where('is_active', true)->first();
        if (!$user) return;

        $task->update(['assigned_to' => $userId]);
        $task->load('project', 'assignee');

        // Send assignment notification
        if ($task->project && $task->project->owner_id) {
            $assigner = User::find($task->project->owner_id);
            if ($assigner) {
                $user->notify(new TaskAssignedNotification($task, $assigner));
            }
        }
    }

    private static function actionMoveToSection(Task $task, array $params): void
    {
        $sectionId = $params['section_id'] ?? null;
        if ($task->section_id == $sectionId) return;

        $task->update(['section_id' => $sectionId]);
    }

    private static function actionAddComment(Task $task, array $params): void
    {
        $message = $params['message'] ?? null;
        if (!$message) return;

        // Replace placeholder variables in the message
        $task->loadMissing('assignee', 'project');
        $message = str_replace(
            ['{task}', '{status}', '{assignee}', '{project}'],
            [
                $task->title,
                ucfirst(str_replace('_', ' ', $task->status)),
                $task->assignee?->name ?? 'Unassigned',
                $task->project?->name ?? '',
            ],
            $message
        );

        // Use the project owner as the comment author, fall back to task creator
        $userId = $task->project?->owner_id ?? $task->created_by ?? auth()->id();

        TaskComment::create([
            'task_id' => $task->id,
            'user_id' => $userId,
            'body' => $message,
        ]);
    }

    private static function actionSendNotification(Task $task, array $params): void
    {
        $target = $params['target'] ?? 'project_owner';

        $recipient = match ($target) {
            'project_owner' => $task->project?->owner_id ? User::find($task->project->owner_id) : null,
            'assignee' => $task->assigned_to ? User::find($task->assigned_to) : null,
            default => is_numeric($target) ? User::find($target) : null,
        };

        if (!$recipient) return;

        // Use a generic task assigned notification as a ping
        $task->load('project');
        $sender = $task->project?->owner_id ? User::find($task->project->owner_id) : ($task->creator ?? auth()->user());
        if ($sender) {
            $recipient->notify(new TaskAssignedNotification($task, $sender));
        }
    }

    private static function actionSetCustomField(Task $task, array $params): void
    {
        $customFieldId = $params['custom_field_id'] ?? null;
        $value = $params['value'] ?? null;
        if (!$customFieldId || !$task->project_id) return;

        $customField = CustomField::where('id', $customFieldId)
            ->where('project_id', $task->project_id)
            ->first();
        if (!$customField) return;

        $cfv = TaskCustomFieldValue::updateOrCreate(
            ['task_id' => $task->id, 'custom_field_id' => $customFieldId],
        );
        $cfv->setTypedValue($customField->type, $value);
        $cfv->save();
    }
}
