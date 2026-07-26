<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreApprovalItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'description' => 'nullable|string|max:10000',
            'approval_section_id' => 'nullable|integer',
            'customFieldValues' => 'nullable|array',
            'customFieldValues.*' => 'nullable',
            'attachments' => 'nullable|array|max:5',
            'attachments.*' => 'file|max:51200|mimes:pdf,doc,docx,xls,xlsx,zip,jpg,jpeg,png',
        ];
    }
}
