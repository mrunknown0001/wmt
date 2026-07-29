<?php

namespace App\Http\Requests;

use App\Services\FolderService;
use Illuminate\Foundation\Http\FormRequest;

class UpdateProjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        $project = $this->route('project');

        return $this->user()->can('manage-projects')
            || $project->owner_id === $this->user()->id
            || $project->isProjectAdmin($this->user());
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'status' => ['required', 'string', 'in:active,on_hold,completed,archived'],
            'owner_id' => ['nullable', 'exists:users,id'],
            'folder_id' => ['nullable', 'exists:folders,id', function ($attribute, $value, $fail) {
                if ((int) $value !== (int) $this->route('project')->folder_id
                    && !FolderService::visibleFolderIds($this->user())->contains((int) $value)) {
                    $fail('You do not have access to that folder.');
                }
            }],
            'due_date' => ['nullable', 'date'],
            'require_comment_attachment_on_close' => ['sometimes', 'boolean'],
            'hide_completed_tasks' => ['sometimes', 'boolean'],
            'task_series_enabled' => ['sometimes', 'boolean'],
            'task_series_prefix' => [
                'nullable', 'string', 'max:20',
                'regex:/^[A-Za-z0-9][A-Za-z0-9\-_\/]*$/',
                function ($attribute, $value, $fail) {
                    $project = $this->route('project');

                    // Once numbers are in circulation the prefix is fixed —
                    // changing it would strand every number already issued.
                    if ($project && $project->taskSeriesStarted()
                        && (string) $value !== (string) $project->task_series_prefix) {
                        $fail('The task number prefix cannot be changed once numbers have been issued.');
                    }
                },
            ],
            'task_series_padding' => ['sometimes', 'integer', 'min:1', 'max:10'],
            'members' => ['nullable', 'array'],
            'members.*.user_id' => ['required', 'exists:users,id'],
            'members.*.role' => ['required', 'string', 'in:viewer,editor,admin'],
        ];
    }
}
