<?php

namespace App\Http\Requests\Concerns;

use App\Models\Project;
use App\Models\Task;
use Closure;
use Illuminate\Validation\Rule;

/**
 * Who may waive a task's project close rules, and on what terms.
 *
 * On the requests rather than in a controller for the same reason as the
 * milestone flag: the web, API and standalone task controllers all share these
 * three requests, so a check in one controller would leave the other paths able
 * to set the flag unguarded.
 */
trait GuardsCloseRuleExemption
{
    /**
     * Refuse the waiver unless this person runs the project.
     *
     * Only refuses when the value would actually *change*, so an assignee
     * submitting the whole edit form unaltered still saves — they simply cannot
     * be the one to move it.
     */
    protected function closeRuleExemptionRule(): Closure
    {
        return function (string $attribute, $value, Closure $fail) {
            $task = $this->route('task');
            $wanted = filter_var($value, FILTER_VALIDATE_BOOLEAN);

            if ($task instanceof Task && (bool) $task->close_rule_exempt === $wanted) {
                return; // unchanged — nothing to authorise
            }

            $project = $this->exemptionProject($task);

            if (!$project) {
                $fail('Only tasks in a project have close rules to waive.');
                return;
            }

            if (!$this->user()?->can('update', $project)) {
                $fail('Only the project owner or an administrator can waive a task\'s close rules.');
            }
        };
    }

    /**
     * A waiver has to say why.
     *
     * The reason is the whole value of the record — an exemption nobody can
     * account for later is indistinguishable from the rule being switched off.
     *
     * Rule::requiredIf rather than a closure because the framework trims input
     * and converts the empty string to null before validation runs. A plain
     * closure is not an implicit rule, so it never sees a blank reason at all
     * and an empty box would be accepted silently. requiredIf resolves to
     * 'required', which is implicit and does run against null.
     */
    protected function closeRuleExemptionReasonRules(): array
    {
        return [
            'nullable',
            'string',
            'max:500',
            Rule::requiredIf(fn () => $this->closeExemptionNeedsReason()),
        ];
    }

    /**
     * Whether this particular request has to carry a reason.
     *
     * Only when the waiver is actually being granted, or when a standing
     * waiver's reason is being erased. An assignee who resubmits the whole edit
     * form with the flag untouched is not making the decision and is not asked
     * to justify it — the same shape as the flag guard above.
     */
    private function closeExemptionNeedsReason(): bool
    {
        if (!filter_var($this->input('close_rule_exempt'), FILTER_VALIDATE_BOOLEAN)) {
            return false; // not exempt, or being withdrawn
        }

        $task = $this->route('task');

        if ($task instanceof Task && $task->close_rule_exempt) {
            // Already waived: the reason stands unless this request blanks it.
            return $this->exists('close_rule_exempt_reason')
                && trim((string) $this->input('close_rule_exempt_reason')) === '';
        }

        return true; // granting now
    }

    /** Plain wording for the one message this trait can raise. */
    public function messages(): array
    {
        return [
            'close_rule_exempt_reason.required' => 'Give a reason for waiving the close rules on this task.',
        ];
    }

    /** The project the waiver would apply in: the route's, the task's, or the body's. */
    private function exemptionProject($task): ?Project
    {
        $project = $this->route('project');
        if ($project instanceof Project) {
            return $project;
        }
        if ($project) {
            return Project::find($project);
        }
        if ($task instanceof Task && $task->project_id) {
            return Project::find($task->project_id);
        }

        return $this->filled('project_id') ? Project::find($this->input('project_id')) : null;
    }
}
