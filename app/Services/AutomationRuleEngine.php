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
use App\Notifications\AutomationBlockedNotification;
use App\Notifications\TaskAssignedNotification;
use App\Services\RecurringTaskService;
use App\Services\SectionRouter;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class AutomationRuleEngine
{
    private static bool $executing = false;

    /** Actions a project rule refused during this request. */
    private static array $skippedActions = [];

    /** Task columns that hold dates and must be compared as such, not as strings. */
    private const DATE_FIELDS = ['due_date', 'start_date', 'completed_at'];

    public static function evaluate(Task $task, string $triggerType, array $oldValues = [], array $changedFieldIds = [], array $context = []): void
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
                // For custom_field_changed triggers, check if the rule targets a specific field
                if ($triggerType === 'custom_field_changed' && !empty($changedFieldIds)) {
                    $triggerCfId = $rule->trigger_config['custom_field_id'] ?? null;
                    if ($triggerCfId && !in_array((int) $triggerCfId, $changedFieldIds)) {
                        continue;
                    }
                }

                // For form_submitted triggers, check if the rule targets a specific form
                if ($triggerType === 'form_submitted') {
                    $triggerFormId = $rule->trigger_config['form_id'] ?? null;
                    if ($triggerFormId && (int) $triggerFormId !== (int) ($context['form_id'] ?? 0)) {
                        continue;
                    }
                }

                if (self::conditionsMet($task, $rule->conditions)) {
                    self::executeActions($task, $rule->actions, $rule->name);

                    // Refresh and broadcast the updated task for real-time UI sync
                    $task->refresh();
                    $task->load('assignee', 'collaborators', 'customFieldValues.selectedOption');

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

    /**
     * Run a single rule against a single task. Used by the scheduled trigger,
     * where there is no originating event to hang evaluate() off.
     *
     * Returns true when the conditions matched and the actions ran.
     */
    public static function runRuleForTask(ProjectAutomationRule $rule, Task $task): bool
    {
        if (self::$executing) {
            return false;
        }

        if (!self::conditionsMet($task, $rule->conditions)) {
            return false;
        }

        self::$executing = true;

        try {
            self::executeActions($task, $rule->actions ?? [], $rule->name);

            $task->refresh();
            $task->load('assignee', 'collaborators', 'customFieldValues.selectedOption');

            broadcast(new TaskUpdated(
                $task->project_id,
                $task->toArray(),
                'updated',
                $task->created_by ?? 0,
            ));

            $actionSummaries = collect($rule->actions ?? [])->map(fn ($a) => $a['type'] ?? 'unknown')->all();
            broadcast(new AutomationRuleExecuted(
                $task->project_id,
                $rule->name,
                ['id' => $task->id, 'title' => $task->title],
                $actionSummaries,
            ));
        } finally {
            self::$executing = false;
        }

        return true;
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
            } elseif (in_array($field, self::DATE_FIELDS, true)) {
                // Built-in dates need real date comparison; the string match below
                // would treat every operator other than equals as "always true".
                $raw = $task->getAttribute($field);
                $isEmpty = $raw === null || $raw === '';

                $met = match ($operator) {
                    'is_empty' => $isEmpty,
                    'is_not_empty' => !$isEmpty,
                    default => self::evaluateDateCondition($raw, $operator, $condition['value'] ?? null),
                };
            } else {
                $taskValue = $task->getAttribute($field);

                // Resolve special placeholder values
                $value = self::resolveSpecialValue($task, $value);

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

    /**
     * Resolve special placeholder values like __project_owner__ to actual IDs.
     */
    private static function resolveSpecialValue(Task $task, $value)
    {
        if ($value === '__project_owner__') {
            $task->loadMissing('project');
            return $task->project?->owner_id;
        }

        return $value;
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

    /** Date operators that compare against today and carry no value of their own. */
    private const TODAY_RELATIVE_OPERATORS = ['is_today', 'before_today', 'after_today'];

    private static function evaluateDateCondition($value, string $operator, $expected): bool
    {
        if ($value === null || $value === '') return false;

        try {
            // Compared at day granularity: a due date of "today" should not fail
            // an is_today check because the stored value carries a time.
            $date = Carbon::parse($value)->startOfDay();
        } catch (\Exception) {
            return false;
        }

        if (in_array($operator, self::TODAY_RELATIVE_OPERATORS, true)) {
            $today = Carbon::today();

            return match ($operator) {
                'is_today' => $date->equalTo($today),
                'before_today' => $date->lessThan($today),
                'after_today' => $date->greaterThan($today),
            };
        }

        // Everything below compares against a fixed date supplied on the rule.
        if ($expected === null || $expected === '') return false;

        try {
            $expectedDate = Carbon::parse($expected)->startOfDay();
        } catch (\Exception) {
            return false;
        }

        return match ($operator) {
            'equals' => $date->equalTo($expectedDate),
            'not_equals' => !$date->equalTo($expectedDate),
            'before' => $date->lessThan($expectedDate),
            'after' => $date->greaterThan($expectedDate),
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

    private static function executeActions(Task $task, array $actions, string $ruleName = ''): void
    {
        foreach ($actions as $action) {
            $type = $action['type'] ?? null;
            $params = $action['params'] ?? [];

            try {
                match ($type) {
                    'change_status' => self::actionChangeStatus($task, $params),
                    'change_priority' => self::actionChangePriority($task, $params),
                    'assign_user' => self::actionAssignUser($task, $params),
                    'move_to_section' => self::actionMoveToSection($task, $params),
                    'send_notification' => self::actionSendNotification($task, $params),
                    'add_comment' => self::actionAddComment($task, $params),
                    'set_custom_field' => self::actionSetCustomField($task, $params),
                    // An unrecognised type used to fall through to null, so a rule
                    // with a misspelt or unsupported action reported itself as
                    // having run while doing nothing at all — the hardest kind of
                    // "the automation isn't working" to get to the bottom of.
                    default => Log::warning('Automation action type not recognised', [
                        'task_id' => $task->id,
                        'rule' => $ruleName,
                        'action' => $type,
                        'supported' => ['change_status', 'change_priority', 'assign_user',
                            'move_to_section', 'send_notification', 'add_comment', 'set_custom_field'],
                    ]),
                };
            } catch (ValidationException $e) {
                // A project rule refused this action — typically "change status to
                // Done" on a task with no attachment. Skip it and carry on: the
                // user's own change has already been applied and committed, so
                // letting this bubble would fail their request with a 422 for
                // something they did not do, and would strand the remaining
                // actions of this rule unexecuted.
                self::$skippedActions[] = [
                    'task_id' => $task->id,
                    'action' => $type,
                    'reason' => $e->validator->errors()->first(),
                ];

                Log::warning('Automation action skipped by a project rule', end(self::$skippedActions));

                self::notifyBlocked($task, $ruleName, $e->validator->errors()->first());
            }
        }
    }

    /**
     * Tell whoever owns the task that the automation could not close it.
     *
     * Throttled per task per recipient per day: the scheduled trigger
     * re-evaluates every hour, so an unattached task would otherwise generate a
     * notification every hour until someone uploads a file.
     */
    private static function notifyBlocked(Task $task, string $ruleName, string $reason): void
    {
        $recipient = $task->assignee ?: User::find($task->created_by);

        if (!$recipient) {
            return;
        }

        if (!Cache::add("automation-blocked:{$task->id}:{$recipient->id}", true, now()->addDay())) {
            return; // already told them today
        }

        try {
            $task->loadMissing('project');
            $recipient->notify(new AutomationBlockedNotification($task, $ruleName, $reason));
        } catch (\Throwable $e) {
            // A notification failure must not break the surrounding action.
            report($e);
        }
    }

    /**
     * Actions refused by a project rule during this request, so the caller can
     * tell the user why the automation did not do what they expected.
     */
    public static function takeSkippedActions(): array
    {
        $skipped = self::$skippedActions;
        self::$skippedActions = [];

        return $skipped;
    }

    private static function actionChangeStatus(Task $task, array $params): void
    {
        $status = $params['status'] ?? null;
        if (!$status || $task->status === $status) return;

        $validStatuses = ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'];
        if (!in_array($status, $validStatuses)) return;

        $oldStatus = $task->status;
        $task->update(['status' => $status]);

        // Completing through a rule has to spawn the next occurrence, exactly as
        // completing by hand does. Every controller calls this after its own
        // status write; this engine was the only path that didn't, so a recurring
        // task closed by automation simply ended.
        //
        // The service itself no-ops unless the task is recurring, actually moved
        // into "done", and has no successor yet — so this is safe to call for any
        // status change.
        $actor = auth()->user()
            ?: User::find($task->created_by)
            ?: User::find($task->assigned_to);

        if ($actor) {
            $newTask = RecurringTaskService::generateNextIfCompleted($task, $oldStatus, $actor);

            // Announce the new occurrence. Unlike the controllers, this path has no
            // response to attach it to — the rule runs server-side — so a broadcast
            // is the only way any open page learns the task exists. Without it the
            // occurrence only appeared after a manual refresh.
            //
            // Not ->toOthers(): the person whose action triggered the rule needs it
            // as much as anyone. The client's 'created' handler ignores ids it
            // already has, so a duplicate is harmless.
            if ($newTask) {
                $newTask->load('assignee', 'collaborators', 'customFieldValues.selectedOption', 'customFieldValues.customField');
                $newTask->loadCount(['subtasks', 'comments', 'attachments']);

                broadcast(new TaskUpdated(
                    $newTask->project_id,
                    $newTask->toArray(),
                    'created',
                    $actor->id,
                ));
            }
        }
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
        if (!$userId) return;

        // Resolve special placeholders
        if ($userId === '__project_owner__') {
            $task->loadMissing('project');
            $userId = $task->project?->owner_id;
            if (!$userId) return;
        }

        if ($task->assigned_to == $userId) return;

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

    /**
     * Move a task to a section, or to a sub-section beneath one.
     *
     * The target is resolved rather than read straight from the params: a rule
     * can now file by period, which means the sub-section may not exist until
     * the first task of that month arrives. See SectionRouter.
     */
    private static function actionMoveToSection(Task $task, array $params): void
    {
        $sectionId = SectionRouter::resolve($task, $params);

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
