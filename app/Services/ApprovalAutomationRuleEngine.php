<?php

namespace App\Services;

use App\Events\ApprovalAutomationRuleExecuted;
use App\Events\ApprovalItemUpdated;
use App\Models\ApprovalAutomationRule;
use App\Models\ApprovalCustomField;
use App\Models\ApprovalItem;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class ApprovalAutomationRuleEngine
{
    private static bool $executing = false;

    public static function evaluate(ApprovalItem $item, string $triggerType, array $context = []): void
    {
        if (self::$executing) {
            return;
        }

        if (!$item->approval_project_id) {
            return;
        }

        $rules = ApprovalAutomationRule::where('approval_project_id', $item->approval_project_id)
            ->where('is_active', true)
            ->where('trigger_type', $triggerType)
            ->get();

        if ($rules->isEmpty()) {
            return;
        }

        self::$executing = true;

        try {
            $item->load('customFieldValues.customField', 'requester');

            foreach ($rules as $rule) {
                if (self::conditionsMet($item, $rule->conditions)) {
                    self::executeActions($item, $rule->actions);

                    // Broadcast automation rule executed
                    $actionSummaries = collect($rule->actions)->map(fn ($a) => $a['type'] ?? 'unknown')->all();
                    broadcast(new ApprovalAutomationRuleExecuted(
                        $item->approval_project_id,
                        $rule->name,
                        ['id' => $item->id, 'title' => $item->title],
                        $actionSummaries,
                    ));
                }
            }
        } finally {
            self::$executing = false;
        }
    }

    private static function conditionsMet(ApprovalItem $item, ?array $conditions): bool
    {
        if (empty($conditions)) {
            return true;
        }

        $logic = $conditions['logic'] ?? 'all';
        $rules = $conditions['rules'] ?? [];

        foreach ($rules as $rule) {
            $field = $rule['field'] ?? null;
            $operator = $rule['operator'] ?? 'equals';
            $value = $rule['value'] ?? null;

            if (!$field) {
                continue;
            }

            if ($field === 'custom_field') {
                $met = self::evaluateCustomFieldCondition($item, $rule);
            } else {
                $itemValue = $item->getAttribute($field);

                $value = self::resolveSpecialValue($item, $value);

                $itemValue = is_null($itemValue) ? null : (string) $itemValue;
                $value = is_null($value) ? null : (string) $value;

                $met = match ($operator) {
                    'equals' => $itemValue === $value,
                    'not_equals' => $itemValue !== $value,
                    'in' => is_array($rule['value']) && in_array($itemValue, array_map('strval', $rule['value'])),
                    'not_in' => is_array($rule['value']) && !in_array($itemValue, array_map('strval', $rule['value'])),
                    default => true,
                };
            }

            if (!$met && $logic === 'all') {
                return false;
            }

            if ($met && $logic === 'any') {
                return true;
            }
        }

        return $logic === 'all';
    }

    private static function resolveSpecialValue(ApprovalItem $item, $value)
    {
        if ($value === '__requester_manager__') {
            $requester = $item->requester;
            if (!$requester) {
                return null;
            }
            $manager = $requester->team?->leader
                ?? $requester->department?->head
                ?? $requester->department?->division?->head;
            return $manager?->id;
        }

        return $value;
    }

    private static function evaluateCustomFieldCondition(ApprovalItem $item, array $condition): bool
    {
        $customFieldId = $condition['custom_field_id'] ?? null;
        if (!$customFieldId) {
            return true;
        }

        $cfv = $item->customFieldValues->firstWhere('approval_custom_field_id', $customFieldId);
        $customField = $cfv?->customField;

        if (!$customField) {
            $customField = ApprovalCustomField::where('id', $customFieldId)
                ->where('approval_project_id', $item->approval_project_id)
                ->first();
        }

        $currentValue = $cfv?->value;
        $operator = $condition['operator'] ?? 'equals';

        if ($operator === 'is_empty') {
            return $currentValue === null || $currentValue === '' || (is_array($currentValue) && empty($currentValue));
        }
        if ($operator === 'is_not_empty') {
            return $currentValue !== null && $currentValue !== '' && !(is_array($currentValue) && empty($currentValue));
        }

        if (!$customField) {
            return false;
        }

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
        if ($value === null || $value === '') {
            return false;
        }

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
        if ($value === null || $value === '') {
            return false;
        }

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

    private static function executeActions(ApprovalItem $item, array $actions): void
    {
        foreach ($actions as $action) {
            $type = $action['type'] ?? null;
            $params = $action['params'] ?? [];

            match ($type) {
                'send_notification' => self::actionSendNotification($item, $params),
                'add_comment' => self::actionAddComment($item, $params),
                'set_custom_field' => self::actionSetCustomField($item, $params),
                default => null,
            };
        }
    }

    private static function actionSendNotification(ApprovalItem $item, array $params): void
    {
        $recipients = self::resolveNotificationRecipients($item, $params['target'] ?? 'requester');

        if ($recipients->isEmpty()) {
            return;
        }

        $message = self::applyPlaceholders($params['message'] ?? '', $item);
        if ($message === '') {
            $message = "Update on \"{$item->title}\"";
        }

        foreach ($recipients as $recipient) {
            $recipient->notify(new \App\Notifications\ApprovalAutomationNotification($item, $message));
        }
    }

    /**
     * Resolve a notification target into the users to notify.
     *
     * Supported targets: 'requester', '__requester_manager__', 'user:{id}' and
     * 'team:{id}' (every active member). A bare numeric id is still accepted so
     * rules saved before the user:/team: prefixes keep working.
     */
    private static function resolveNotificationRecipients(ApprovalItem $item, string $target): Collection
    {
        if ($target === 'requester') {
            return collect([$item->requester])->filter();
        }

        if ($target === '__requester_manager__') {
            return collect([self::resolveRequesterManager($item)])->filter();
        }

        if (str_starts_with($target, 'team:')) {
            $teamId = (int) substr($target, 5);

            return $teamId
                ? User::where('team_id', $teamId)->where('is_active', true)->get()
                : collect();
        }

        $userId = str_starts_with($target, 'user:') ? (int) substr($target, 5) : (int) $target;

        return $userId
            ? User::where('id', $userId)->where('is_active', true)->get()
            : collect();
    }

    private static function actionAddComment(ApprovalItem $item, array $params): void
    {
        $message = self::applyPlaceholders($params['message'] ?? '', $item);
        if ($message === '') {
            return;
        }

        // System-generated comment (no author — rendered as "Automation" in the UI).
        $item->comments()->create([
            'user_id' => null,
            'body' => $message,
        ]);
    }

    /**
     * Substitute the supported template variables in an automation message.
     */
    private static function applyPlaceholders(?string $message, ApprovalItem $item): string
    {
        if (!$message) {
            return '';
        }

        return str_replace(
            ['{item}', '{status}', '{requester}'],
            [
                $item->title,
                ucfirst(str_replace('_', ' ', $item->status)),
                $item->requester?->name ?? 'Unknown',
            ],
            $message
        );
    }

    private static function actionSetCustomField(ApprovalItem $item, array $params): void
    {
        $customFieldId = $params['custom_field_id'] ?? null;
        $value = $params['value'] ?? null;
        if (!$customFieldId) {
            return;
        }

        $customField = ApprovalCustomField::where('id', $customFieldId)
            ->where('approval_project_id', $item->approval_project_id)
            ->first();
        if (!$customField) {
            return;
        }

        $cfv = $item->customFieldValues()->updateOrCreate(
            ['approval_custom_field_id' => $customFieldId],
        );
        $cfv->setTypedValue($customField->type, $value);
        $cfv->save();
    }

    private static function resolveRequesterManager(ApprovalItem $item): ?User
    {
        $requester = $item->requester;
        if (!$requester) {
            return null;
        }

        return $requester->team?->leader
            ?? $requester->department?->head
            ?? $requester->department?->division?->head;
    }
}
