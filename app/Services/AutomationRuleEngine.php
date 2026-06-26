<?php

namespace App\Services;

use App\Models\ProjectAutomationRule;
use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;

class AutomationRuleEngine
{
    private static bool $executing = false;

    public static function evaluate(Task $task, string $triggerType, array $oldValues = []): void
    {
        // Guard against infinite loops — don't re-trigger rules from rule-caused changes
        if (self::$executing) {
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

        foreach ($conditions as $condition) {
            $field = $condition['field'] ?? null;
            $operator = $condition['operator'] ?? 'equals';
            $value = $condition['value'] ?? null;

            if (!$field) continue;

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

            if (!$met) {
                return false;
            }
        }

        return true;
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
}
