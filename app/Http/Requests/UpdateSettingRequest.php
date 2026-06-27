<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSettingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->hasRole('admin');
    }

    public function rules(): array
    {
        return [
            'app_name' => ['required', 'string', 'max:255'],
            'primary_color' => ['required', 'string', 'in:blue,indigo,violet,teal,green,red,orange,rose'],
            'max_upload_size' => ['required', 'integer', 'min:1', 'max:100'],
            'task_reminders_enabled' => ['required', 'boolean'],
            'task_reminder_days' => ['required_if:task_reminders_enabled,true', 'array', 'min:1'],
            'task_reminder_days.*' => ['integer', 'min:1', 'max:30'],
            'escalation_enabled' => ['required', 'boolean'],
            'escalation_tiers' => ['required', 'array', 'size:4'],
            'escalation_tiers.*.days' => ['required', 'integer', 'min:1', 'max:90'],
            'escalation_tiers.*.enabled' => ['required', 'boolean'],
        ];
    }
}
