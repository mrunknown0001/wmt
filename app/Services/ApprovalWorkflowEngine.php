<?php

namespace App\Services;

use App\Models\ApprovalChain;
use App\Models\ApprovalChainVersion;
use App\Models\ApprovalItem;
use App\Models\ApprovalStep;
use App\Models\ApprovalStepDecision;
use App\Models\ApprovalStepInstance;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use App\Services\ApprovalAutomationRuleEngine;

class ApprovalWorkflowEngine
{
    private static bool $executing = false;

    public static function submit(ApprovalItem $item): void
    {
        if (self::$executing) {
            return;
        }

        self::$executing = true;

        try {
            self::withLockedItem($item, function () use ($item) {
                // Resolve which chain to use based on selector_conditions
                $chainVersion = self::resolveChainForItem($item);
                if (!$chainVersion) {
                    $item->update(['status' => 'rejected']);
                    return;
                }

                $item->update([
                    'approval_chain_version_id' => $chainVersion->id,
                    'submitted_at' => now(),
                ]);

                // Activate the first step
                self::materializeAndActivateStep($item, 1, 1);

                // Fire automation on submission
                ApprovalAutomationRuleEngine::evaluate($item, 'item_submitted');
            });
        } finally {
            self::$executing = false;
        }
    }

    public static function advance(ApprovalItem $item, string $action, User $actor, ?string $comment = null): ApprovalStepDecision
    {
        if (self::$executing) {
            abort(409, 'Workflow is currently processing.');
        }

        self::$executing = true;

        try {
            return self::withLockedItem($item, function () use ($item, $action, $actor, $comment) {
                $currentInstance = $item->stepInstances()
                    ->where('status', 'active')
                    ->first();

                if (!$currentInstance) {
                    abort(409, 'No active approval step found.');
                }

                // Authorize: actor must be an eligible approver
                if (!$currentInstance->approvers()->where('user_id', $actor->id)->exists()) {
                    abort(403, 'You are not authorized to approve this step.');
                }

                // One decision per approver per attempt. The unique index on
                // (instance, decided_by) enforces this as well, but holding the
                // item lock lets a double-submitted form get a clean 409 instead
                // of surfacing as a constraint violation.
                if ($currentInstance->decisions()->where('decided_by', $actor->id)->exists()) {
                    abort(409, 'You have already recorded a decision on this step.');
                }

                // Record decision
                $decision = $currentInstance->decisions()->create([
                    'decided_by' => $actor->id,
                    'decision' => $action,
                    'comment' => $comment,
                    'decided_at' => now(),
                ]);

                // Evaluate step outcome
                $outcome = self::evaluateStepOutcome($currentInstance);

                // Fire automation on step decision
                ApprovalAutomationRuleEngine::evaluate($item, 'approval_step_decided');

                if ($outcome === 'approved') {
                    self::progressToNextStep($item, $currentInstance);
                    // Fire automation on next step activation
                    ApprovalAutomationRuleEngine::evaluate($item, 'approval_requested');
                } elseif ($outcome === 'rejected') {
                    self::applyRejectionBehavior($item, $currentInstance);
                }
                // else: still waiting on more approvers, do nothing

                return $decision;
            });
        } finally {
            self::$executing = false;
        }
    }

    public static function cancel(ApprovalItem $item, User $actor, ?string $reason = null): void
    {
        if (self::$executing) {
            return;
        }

        self::$executing = true;

        try {
            self::withLockedItem($item, function () use ($item) {
                $item->update([
                    'status' => 'cancelled',
                    'decided_at' => now(),
                ]);

                // Close any active instances
                $item->stepInstances()
                    ->where('status', 'active')
                    ->update(['status' => 'cancelled', 'completed_at' => now()]);

                // Fire automation on cancellation
                ApprovalAutomationRuleEngine::evaluate($item, 'approval_cancelled');
            });
        } finally {
            self::$executing = false;
        }
    }

    public static function resubmit(ApprovalItem $item, User $actor): void
    {
        if (self::$executing) {
            return;
        }

        self::$executing = true;

        try {
            self::withLockedItem($item, function () use ($item) {
                // A requester can revive a request that was sent back for changes or
                // outright rejected. Checked under the lock, so two resubmits fired
                // at once can't both open a fresh attempt.
                if (!in_array($item->status, ['changes_requested', 'rejected'], true)) {
                    abort(409, 'Only a rejected or changes-requested item can be resubmitted.');
                }

                // decided_at is set when a request is finalised as rejected; clear it so
                // the revived request isn't reported as already decided.
                $item->update(['status' => 'pending', 'decided_at' => null]);

                // Re-enter at step 1 with new attempt number
                $maxAttempt = $item->stepInstances()
                    ->where('step_number', 1)
                    ->max('attempt_number') ?? 0;

                self::materializeAndActivateStep($item, 1, $maxAttempt + 1);
            });
        } finally {
            self::$executing = false;
        }
    }

    /**
     * Run a workflow mutation atomically with the request's own row locked.
     *
     * The lock is taken on approval_items rather than on a step instance because
     * progressing a chain *creates* instances: two approvers deciding at the same
     * moment would otherwise lock different rows, both see the quorum met, and
     * both activate the next step. The item is the one row every path touches.
     *
     * The locking read runs first so it, not a later plain SELECT, establishes
     * what this transaction sees — everything below reads state committed by
     * whichever request held the lock before us.
     *
     * withTrashed() because ApprovalItem soft-deletes: the default scope would
     * match no row for a trashed request and quietly take no lock at all, which
     * is exactly the case (cancelling, finalising) we still need serialized.
     */
    private static function withLockedItem(ApprovalItem $item, callable $callback)
    {
        return DB::transaction(function () use ($item, $callback) {
            ApprovalItem::withTrashed()->whereKey($item->getKey())->lockForUpdate()->first();

            $item->refresh();

            return $callback();
        });
    }

    private static function resolveChainForItem(ApprovalItem $item): ?ApprovalChainVersion
    {
        $item->load('customFieldValues.customField');

        $chains = ApprovalChain::where('approval_project_id', $item->approval_project_id)
            ->where('is_active', true)
            ->orderBy('priority')
            ->get();

        foreach ($chains as $chain) {
            if ($chain->is_default) {
                continue;
            }

            if (self::conditionsMet($item, $chain->selector_conditions)) {
                return $chain->currentVersion();
            }
        }

        // Default chain fallback
        $defaultChain = $chains->firstWhere('is_default', true);
        if ($defaultChain) {
            return $defaultChain->currentVersion();
        }

        return null;
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
                $met = false;
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

    private static function evaluateCustomFieldCondition(ApprovalItem $item, array $condition): bool
    {
        $customFieldId = $condition['custom_field_id'] ?? null;
        if (!$customFieldId) {
            return true;
        }

        $cfv = $item->customFieldValues->firstWhere('approval_custom_field_id', $customFieldId);
        $customField = $cfv?->customField;

        if (!$customField) {
            return false;
        }

        $currentValue = $cfv?->value;
        $operator = $condition['operator'] ?? 'equals';

        if ($operator === 'is_empty') {
            return $currentValue === null || $currentValue === '' || (is_array($currentValue) && empty($currentValue));
        }
        if ($operator === 'is_not_empty') {
            return $currentValue !== null && $currentValue !== '' && !(is_array($currentValue) && empty($currentValue));
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

    private static function materializeAndActivateStep(ApprovalItem $item, int $stepNumber, int $attemptNumber): void
    {
        $step = $item->chainVersion->steps()->where('step_number', $stepNumber)->first();
        if (!$step) {
            // No more steps — finalize as approved
            self::finalize($item, 'approved');
            return;
        }

        // Check if step should be skipped (only if skip_conditions is explicitly defined)
        if ($step->skip_conditions && self::conditionsMet($item, $step->skip_conditions)) {
            // Skip this step and move to next
            self::materializeAndActivateStep($item, $stepNumber + 1, $attemptNumber);
            return;
        }

        // Resolve approvers for this step
        $approvers = ApprovalApproverResolver::resolve($step, $item);
        if ($approvers->isEmpty()) {
            // No approvers — skip and move to next
            self::materializeAndActivateStep($item, $stepNumber + 1, $attemptNumber);
            return;
        }

        // Create the step instance
        $instance = $item->stepInstances()->create([
            'approval_step_id' => $step->id,
            'step_number' => $stepNumber,
            'attempt_number' => $attemptNumber,
            'status' => 'active',
            'quorum_required' => ApprovalApproverResolver::requiredQuorum($step, $approvers->count()),
            'activated_at' => now(),
            // Stamped now from whichever SLA applies, so a later edit to the
            // chain cannot move the deadline of work already under way.
            'due_at' => ApprovalDeadlineService::dueAtFor($step, $item->approvalProject),
        ]);

        // Materialize the eligible approver snapshot and notify each approver
        // that an item is now awaiting their decision.
        foreach ($approvers as $approver) {
            $instance->approvers()->create(['user_id' => $approver->id]);
            self::notifyAfterCommit($approver, new \App\Notifications\ApprovalRequestedNotification($item, $step));
        }

        // Anyone away has their stand-in added, and told, so the step does not
        // sit waiting on somebody who is not there.
        foreach (ApprovalDelegationService::activeFor($approvers->pluck('id')) as $delegation) {
            if ($instance->approvers()->where('user_id', $delegation->delegate_id)->exists()) {
                continue;
            }

            $instance->approvers()->create([
                'user_id' => $delegation->delegate_id,
                'delegated_from_user_id' => $delegation->user_id,
            ]);

            self::notifyAfterCommit(
                $delegation->delegate,
                new \App\Notifications\ApprovalRequestedNotification($item, $step)
            );
        }

        // Update the item's current step
        $item->update(['current_step_number' => $stepNumber]);
    }

    private static function progressToNextStep(ApprovalItem $item, ApprovalStepInstance $currentInstance): void
    {
        $currentInstance->update(['status' => 'approved', 'completed_at' => now()]);
        self::materializeAndActivateStep($item, $currentInstance->step_number + 1, 1);
    }

    private static function applyRejectionBehavior(ApprovalItem $item, ApprovalStepInstance $currentInstance): void
    {
        $behavior = $currentInstance->step?->on_reject_override
            ?? $item->chainVersion->chain->on_reject_behavior
            ?? 'reject_item';

        $currentInstance->update(['status' => 'rejected', 'completed_at' => now()]);

        match ($behavior) {
            'reject_item' => self::finalize($item, 'rejected'),
            'return_to_previous_step' => self::returnToPreviousStep($item, $currentInstance),
            'return_to_requester' => self::returnToRequester($item),
            default => self::finalize($item, 'rejected'),
        };
    }

    private static function returnToPreviousStep(ApprovalItem $item, ApprovalStepInstance $currentInstance): void
    {
        $previousStepNumber = $currentInstance->step_number - 1;

        if ($previousStepNumber < 1) {
            // No previous step — return to requester
            self::returnToRequester($item);
            return;
        }

        // Get the max attempt for the previous step
        $maxAttempt = $item->stepInstances()
            ->where('step_number', $previousStepNumber)
            ->max('attempt_number') ?? 0;

        // Materialize new attempt of previous step
        self::materializeAndActivateStep($item, $previousStepNumber, $maxAttempt + 1);
    }

    private static function returnToRequester(ApprovalItem $item): void
    {
        $item->update([
            'status' => 'changes_requested',
            'current_step_number' => null,
        ]);

        // Mark all active instances as rejected/pending
        $item->stepInstances()
            ->where('status', 'active')
            ->update(['status' => 'rejected', 'completed_at' => now()]);

        self::notifyRequester($item, 'changes_requested');

        // Fire automation on changes requested
        ApprovalAutomationRuleEngine::evaluate($item, 'approval_changes_requested');
    }

    private static function finalize(ApprovalItem $item, string $status): void
    {
        $item->update([
            'status' => $status,
            'decided_at' => now(),
            'current_step_number' => null,
        ]);

        // Tell the requester the outcome before automation runs — an automation
        // rule that throws must not swallow the requester's own notification.
        self::notifyRequester($item, $status);

        // Fire automation on final transitions
        if ($status === 'approved') {
            ApprovalAutomationRuleEngine::evaluate($item, 'approval_completed');
        } elseif ($status === 'rejected') {
            ApprovalAutomationRuleEngine::evaluate($item, 'approval_rejected');
        }
    }

    /**
     * Notify the requester that their item reached a terminal state.
     */
    private static function notifyRequester(ApprovalItem $item, string $outcome): void
    {
        if (!in_array($outcome, \App\Notifications\ApprovalDecisionNotification::OUTCOMES, true)) {
            return;
        }

        // $item->requester is null for e.g. an item raised through a public form
        // with no account behind it; notifyAfterCommit tolerates that.
        self::notifyAfterCommit(
            $item->requester,
            new \App\Notifications\ApprovalDecisionNotification($item, $outcome)
        );
    }

    /**
     * Queue a notification to go out once the surrounding transaction commits.
     *
     * Workflow mutations run inside a transaction that may roll back, and mail
     * cannot be unsent — so nothing is dispatched until the decision it announces
     * is durable. With no transaction open the callback fires immediately, which
     * keeps any future non-transactional caller working unchanged.
     *
     * Failures are swallowed: a dead mail/queue connection must not take down a
     * decision that has already been committed.
     */
    private static function notifyAfterCommit(?User $user, $notification): void
    {
        if (!$user) {
            return;
        }

        DB::afterCommit(function () use ($user, $notification) {
            try {
                $user->notify($notification);
            } catch (\Throwable $e) {
                report($e);
            }
        });
    }

    private static function evaluateStepOutcome(ApprovalStepInstance $instance): ?string
    {
        $decisions = $instance->decisions;
        $approvedCount = $decisions->where('decision', 'approved')->count();
        $totalEligible = $instance->approvers()->count();
        $required = $instance->quorum_required;

        if ($approvedCount >= $required) {
            return 'approved';
        }

        $remainingUndecided = $totalEligible - $decisions->count();
        if ($approvedCount + $remainingUndecided < $required) {
            return 'rejected';
        }

        return null; // Still waiting
    }
}
