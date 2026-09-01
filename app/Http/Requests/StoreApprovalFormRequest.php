<?php

namespace App\Http\Requests;

use App\Rules\RichTextLength;
use Illuminate\Foundation\Http\FormRequest;

class StoreApprovalFormRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'description' => ['nullable', 'string', new RichTextLength(1000)],
            'is_active' => 'nullable|boolean',
            'submit_button_text' => 'nullable|string|max:100',
            'success_message' => 'nullable|string|max:1000',
            'email_mode' => 'nullable|string|in:any,registered',
            'item_defaults' => 'nullable|array',
            'item_defaults.status' => 'nullable|string',
            'item_defaults.section_id' => 'nullable|integer',
            'item_defaults.title_field_ids' => 'nullable|array',
            'logo' => 'nullable|image|max:2048',
            'logo_position' => 'nullable|string|in:left,center,right',
            'banner' => 'nullable|image|max:5120',
            'fields' => 'required|array|min:1',
            'fields.*.type' => 'required|string|in:text,textarea,select,multi_select,date,number,email,heading,description,attachment,capture_photo,capture_video',
            'fields.*.label' => 'required|string|max:255',
            'fields.*.help_text' => ['nullable', 'string', new RichTextLength(500)],
            'fields.*.is_required' => 'nullable|boolean',
            'fields.*.config' => 'nullable|array',
            'fields.*.maps_to' => 'nullable|string|in:description,custom_field,assignee',
            'fields.*.custom_field_id' => 'nullable|integer',
            'fields.*.default_value' => 'nullable|string',
            'fields.*.is_visible' => 'nullable|boolean',
            'fields.*.conditions' => 'nullable|array',
        ];
    }
}
