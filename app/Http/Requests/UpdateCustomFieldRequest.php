<?php

namespace App\Http\Requests;

use App\Models\CustomField;
use Illuminate\Foundation\Http\FormRequest;

class UpdateCustomFieldRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'in:' . implode(',', CustomField::TYPES)],
            'is_required' => ['sometimes', 'boolean'],
            'position' => ['sometimes', 'integer', 'min:0'],
            'config' => ['nullable', 'array'],
            'config.formula' => [
                'required_if:type,formula', 'string', 'max:1000',
                function ($attribute, $value, $fail) {
                    if (!$value) return;
                    if (substr_count($value, '{') !== substr_count($value, '}')) {
                        $fail('Formula has unbalanced field references.');
                    }
                    if (substr_count($value, '(') !== substr_count($value, ')')) {
                        $fail('Formula has unbalanced parentheses.');
                    }
                },
            ],
            'config.result_type' => ['required_if:type,formula', 'string', 'in:number,date,boolean'],
            'config.decimal_places' => ['nullable', 'integer', 'min:0', 'max:10'],
            'config.sort_mode' => ['nullable', 'string', 'in:alphabetical,manual'],
            'config.default_value' => ['nullable'],
            // Week of Year names the date field it derives from: a built-in
            // column name, or 'cf:<id>' for a date custom field.
            'config.reference_field' => ['nullable', 'string', 'max:64', 'regex:/^(cf:[0-9]+|[a-z_]+)$/'],
            // People fields carry an optional org scope, set on the field definition.
            'config.division_id' => ['nullable', 'integer', 'exists:divisions,id'],
            'config.department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'config.team_id' => ['nullable', 'integer', 'exists:teams,id'],
            'default_option_indexes' => ['nullable', 'array'],
            'default_option_indexes.*' => ['integer', 'min:0'],
            'options' => ['required_if:type,single_select,multi_select', 'array', 'min:1'],
            'options.*.id' => ['nullable', 'integer'],
            'options.*.label' => ['required_with:options', 'string', 'max:255'],
            'options.*.color' => ['nullable', 'string', 'max:7'],
        ];
    }
}
