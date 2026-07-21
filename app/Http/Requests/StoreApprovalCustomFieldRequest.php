<?php

namespace App\Http\Requests;

use App\Models\ApprovalCustomField;
use Illuminate\Foundation\Http\FormRequest;

class StoreApprovalCustomFieldRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'type' => 'required|string|in:'.implode(',', ApprovalCustomField::TYPES),
            'is_required' => 'nullable|boolean',
            'position' => 'nullable|integer|min:0',
            'config' => 'nullable|array',
            'options' => 'nullable|array',
            'options.*.label' => 'required_with:options|string|max:255',
            'options.*.color' => 'nullable|string',
        ];
    }
}
