<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreProjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('manage-projects');
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'status' => ['required', 'string', 'in:active,on_hold,completed,archived'],
            'owner_id' => ['nullable', 'exists:users,id'],
            'due_date' => ['nullable', 'date'],
            'members' => ['nullable', 'array'],
            'members.*.user_id' => ['required', 'exists:users,id'],
            'members.*.role' => ['required', 'string', 'in:viewer,editor'],
        ];
    }
}
