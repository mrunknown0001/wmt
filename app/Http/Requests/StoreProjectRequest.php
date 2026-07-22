<?php

namespace App\Http\Requests;

use App\Services\FolderService;
use Illuminate\Foundation\Http\FormRequest;

class StoreProjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'status' => ['required', 'string', 'in:active,on_hold,completed,archived'],
            'owner_id' => ['nullable', 'exists:users,id'],
            'folder_id' => ['nullable', 'exists:folders,id', function ($attribute, $value, $fail) {
                if (!FolderService::visibleFolderIds($this->user())->contains((int) $value)) {
                    $fail('You do not have access to that folder.');
                }
            }],
            'due_date' => ['nullable', 'date'],
            'require_comment_attachment_on_close' => ['sometimes', 'boolean'],
            'members' => ['nullable', 'array'],
            'members.*.user_id' => ['required', 'exists:users,id'],
            'members.*.role' => ['required', 'string', 'in:viewer,editor,admin'],
        ];
    }
}
