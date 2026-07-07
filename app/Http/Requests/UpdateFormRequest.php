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
            'task_defaults.section_id' => ['sometimes', 'nullable'],
            'task_defaults.title_field_ids' => ['sometimes', 'array'],
            'task_defaults.title_field_ids.*' => ['integer'],
            'fields' => ['required', 'array', 'min:1'],
            'fields.*.id' => ['nullable', 'integer'],
            'fields.*.type' => ['required', 'string', 'in:' . implode(',', FormField::TYPES)],
            'fields.*.label' => ['required', 'string', 'max:255'],
            'fields.*.help_text' => ['nullable', 'string', 'max:1000'],
            'fields.*.is_required' => ['sometimes', 'boolean'],
            'fields.*.position' => ['required', 'integer', 'min:0'],
            'fields.*.config' => ['nullable', 'array'],
            'fields.*.default_value' => ['nullable', 'string'],
            'fields.*.is_visible' => ['sometimes', 'boolean'],
            'fields.*.conditions' => ['nullable', 'array'],
            'fields.*.conditions.logic' => ['sometimes', 'string', 'in:all,any'],
            'fields.*.conditions.rules' => ['sometimes', 'array'],
            'fields.*.conditions.rules.*.field_key' => ['required', 'string'],
            'fields.*.conditions.rules.*.field_id' => ['nullable', 'integer'],
            'fields.*.conditions.rules.*.operator' => ['required', 'string', 'in:equals,not_equals,contains,is_empty,is_not_empty'],
            'fields.*.conditions.rules.*.value' => ['nullable'],
            'fields.*.maps_to' => ['nullable', 'string', 'in:title,description,custom_field'],
            'fields.*.custom_field_id' => ['nullable', 'exists:custom_fields,id'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $fields = $this->input('fields', []);
            $mappings = [];

            foreach ($fields as $i => $field) {
                $mapsTo = $field['maps_to'] ?? null;
                if (!$mapsTo) continue;

                $key = $mapsTo === 'custom_field'
                    ? "custom_field:{$field['custom_field_id']}"
                    : $mapsTo;

                if (in_array($key, $mappings)) {
                    $label = $mapsTo === 'custom_field' ? 'custom field' : $mapsTo;
                    $validator->errors()->add("fields.{$i}.maps_to", "This {$label} mapping is already used by another field.");
                } else {
                    $mappings[] = $key;
                }
            }
        });
    }
}
