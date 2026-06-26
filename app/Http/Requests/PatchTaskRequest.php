<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class PatchTaskRequest extends FormRequest
{
    public function authorize(): bool
    {
        $task = $this->route('task');

        return $this->user()->can('manage-tasks')
            || $task->project->owner_id === $this->user()->id
            || $task->assigned_to === $this->user()->id;
    }

    public function rules(): array
    {
        return [
            'status' => ['sometimes', 'required', 'string', 'in:backlog,to_do,in_progress,in_review,done,cancelled'],
            'priority' => ['sometimes', 'required', 'string', 'in:low,medium,high,urgent'],
            'assigned_to' => ['sometimes', 'nullable', 'exists:users,id'],
            'due_date' => ['sometimes', 'nullable', 'date'],
            'section_id' => ['sometimes', 'nullable', 'exists:task_sections,id'],
        ];
    }
}
