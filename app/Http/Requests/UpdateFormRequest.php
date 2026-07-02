<?php

namespace App\Http\Requests;

use App\Models\FormField;
use Illuminate\Foundation\Http\FormRequest;

class UpdateFormRequest extends FormRequest
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
            'is_active' => ['sometimes', 'boolean'],
            'submit_button_text' => ['sometimes', 'string', 'max:255'],
            'success_message' => ['nullable', 'string', 'max:5000'],
            'task_defaults' => ['nullable', 'array'],
            'task_defaults.status' => ['sometimes', 'string', 'in:backlog,to_do,in_progress,in_review'],
            'task_defaults.priority' => ['sometimes', 'string', 'in:low,medium,high,urgent'],
            'task_defaults.assigned_to' => ['sometimes', 'nullable', 'exists:users,id'],
            'task_defaults.section_id' => ['sometimes', 'nullable'],
            'fields' => ['required', 'array', 'min:1'],
            'fields.*.id' => ['nullable', 'integer'],
            'fields.*.type' => ['required', 'string', 'in:' . implode(',', FormField::TYPES)],
            'fields.*.label' => ['required', 'string', 'max:255'],
            'fields.*.help_text' => ['nullable', 'string', 'max:1000'],
            'fields.*.is_required' => ['sometimes', 'boolean'],
            'fields.*.position' => ['required', 'integer', 'min:0'],
            'fields.*.config' => ['nullable', 'array'],
            'fields.*.maps_to' => ['nullable', 'string', 'in:title,description,custom_field'],
            'fields.*.custom_field_id' => ['nullable', 'exists:custom_fields,id'],
        ];
    }
}
