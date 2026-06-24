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
            'due_date' => ['nullable', 'date'],
            'parent_id' => ['nullable', 'exists:tasks,id'],
            'collaborator_ids' => ['nullable', 'array'],
            'collaborator_ids.*' => ['exists:users,id'],
        ];
    }
}
