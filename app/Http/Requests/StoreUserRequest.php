<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('manage-users');
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:' . User::class],
            'password' => ['required', 'confirmed', Password::defaults()],
            'department_id' => ['nullable', 'exists:departments,id'],
            'team_id' => ['nullable', 'exists:teams,id'],
            'position' => ['nullable', 'string', 'max:255'],
            'is_active' => ['boolean'],
            'can_create_rules' => ['boolean'],
            'can_approve' => ['boolean'],
            'can_create_project' => ['boolean'],
            'daily_capacity_minutes' => ['nullable', 'integer', 'min:0', 'max:1440'],
            'working_days' => ['nullable', 'array', 'max:7'],
            'working_days.*' => ['integer', 'between:1,7'],
            'can_request' => ['boolean'],
            'role' => ['required', 'string', 'exists:roles,name'],
        ];
    }
}
