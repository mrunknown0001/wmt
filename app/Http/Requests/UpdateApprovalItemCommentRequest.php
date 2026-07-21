<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateApprovalItemCommentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'body' => 'required|string|max:2000',
        ];
    }

    public function messages(): array
    {
        return [
            'body.required' => 'Comment body is required.',
            'body.max' => 'Comment must not exceed 2000 characters.',
        ];
    }
}
