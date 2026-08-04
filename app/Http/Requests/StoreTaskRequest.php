<?php

namespace App\Http\Requests;

use App\Models\Task;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTaskRequest extends FormRequest
{
    public function authorize(): bool
    {
        $project = $this->route('project');

        if (! $project) {
            return true;
        }

        return $this->user()->can('manage-tasks')
            || $project->owner_id === $this->user()->id;
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
            'section_id' => ['nullable', 'exists:task_sections,id'],
            'custom_field_values' => ['nullable', 'array'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if ($this->start_date && $this->due_date && $this->start_date > $this->due_date) {
                $validator->errors()->add('start_date', 'The start date must be before or equal to the due date.');
            }

            $project = $this->route('project');
            if (! $project && $this->assigned_to) {
                $user = $this->user();
                $canAssignOthers = $user->hasPermissionTo('manage-tasks')
                    || $user->hasAnyRole(['supervisor', 'division_head', 'executive', 'admin']);

                if (! $canAssignOthers && (int) $this->assigned_to !== $user->id) {
                    $validator->errors()->add('assigned_to', 'You can only assign standalone tasks to yourself.');
                }
            }
        });
    }
}
