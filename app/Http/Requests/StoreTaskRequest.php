<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreTaskRequest extends FormRequest
{
    public function authorize(): bool
    {
        $project = $this->route('project');

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
            'start_date' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date'],
            'parent_id' => ['nullable', 'exists:tasks,id'],
            'collaborator_ids' => ['nullable', 'array'],
            'collaborator_ids.*' => ['exists:users,id'],
            'is_recurring' => ['sometimes', 'boolean'],
            'recurrence_frequency' => ['required_if:is_recurring,true', 'nullable', 'string', 'in:daily,weekly,monthly,yearly'],
            'recurrence_interval' => ['required_if:is_recurring,true', 'nullable', 'integer', 'min:1', 'max:365'],
            'section_id' => ['nullable', 'exists:task_sections,id'],
        ];
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
