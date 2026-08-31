<?php

namespace App\Http\Requests;

use App\Models\Task;
use App\Http\Requests\Concerns\GuardsMilestoneFlag;
use App\Http\Requests\Concerns\GuardsCloseRuleExemption;
use App\Http\Requests\Concerns\ScopesSectionToProject;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateTaskRequest extends FormRequest
{
    use GuardsMilestoneFlag, GuardsCloseRuleExemption;
    use ScopesSectionToProject;

    public function authorize(): bool
    {
        $task = $this->route('task');

        // Ask the policy rather than paraphrasing it. This carried the same
        // omission as the store request — owner or assignee, never membership —
        // so a project admin who was neither could not edit any task in a
        // project they administer, while TaskPolicy::update said they could.
        return $task !== null && $this->user()->can('update', $task);
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'status' => ['required', 'string', 'in:backlog,to_do,in_progress,in_review,done,cancelled'],
            'priority' => ['required', 'string', 'in:low,medium,high,urgent'],
            'assigned_to' => ['nullable', 'exists:users,id'],
            'project_id' => ['nullable', 'exists:projects,id'],
            'start_date' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date'],
            // Optional clock time for the due date. H:i from the browser's time
            // input; H:i:s accepted so a value read back from the DB round-trips.
            'due_time' => ['nullable', 'date_format:H:i,H:i:s'],
            'estimated_minutes' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'parent_id' => ['nullable', 'exists:tasks,id'],
            'collaborator_ids' => ['nullable', 'array'],
            'collaborator_ids.*' => ['exists:users,id'],
            'is_recurring' => ['sometimes', 'boolean'],
            'recurrence_frequency' => ['required_if:is_recurring,true', 'nullable', 'string',
                // Off the model constant rather than an inline list, so adding
                // a frequency can't leave validation rejecting it.
                Rule::in(Task::RECURRENCE_FREQUENCIES)],
            'recurrence_interval' => ['required_if:is_recurring,true', 'nullable', 'integer', 'min:1', 'max:365'],
            // Variance for the recurrence. Shape depends on the frequency:
            //   weekly  -> days: ISO weekdays 1..7
            //   monthly -> mode + its own parameters
            'recurrence_config' => ['nullable', 'array'],
            'recurrence_config.days' => ['nullable', 'array', 'max:7'],
            'recurrence_config.days.*' => ['integer', 'min:1', 'max:7'],
            'recurrence_config.mode' => ['nullable', 'string', 'in:day_of_month,last_day,nth_weekday'],
            'recurrence_config.day' => ['nullable', 'integer', 'min:1', 'max:31'],
            // -1 is "last week of the month"; 1..5 are the ordinals.
            'recurrence_config.week' => ['nullable', 'integer', 'min:-1', 'max:5', 'not_in:0'],
            'recurrence_config.weekday' => ['nullable', 'integer', 'min:1', 'max:7'],
            'section_id' => ['nullable', $this->sectionIdRule()],
            'task_type' => ['nullable', Rule::in(Task::TASK_TYPES)],
            'is_milestone' => ['boolean', $this->milestoneFlagRule()],
            'close_rule_exempt' => ['boolean', $this->closeRuleExemptionRule()],
            'close_rule_exempt_reason' => $this->closeRuleExemptionReasonRules(),
            'custom_field_values' => ['nullable', 'array'],
        ];
    }

    public function validated($key = null, $default = null): mixed
    {
        $validated = parent::validated($key, $default);

        if ($key !== null) {
            return $validated;
        }

        $task = $this->route('task');
        $canManage = $this->user()->can('manage-tasks');

        if (! $canManage && ! $task->isStandalone()) {
            $canManage = $task->project->owner_id === $this->user()->id;
        }

        if (! $canManage && $task->isStandalone()) {
            $canManage = $task->created_by === $this->user()->id;
        }

        if (! $canManage) {
            unset($validated['assigned_to'], $validated['start_date'], $validated['due_date']);
        }

        return $validated;
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if ($this->start_date && $this->due_date && $this->start_date > $this->due_date) {
                $validator->errors()->add('start_date', 'The start date must be before or equal to the due date.');
            }
        });
    }
}
