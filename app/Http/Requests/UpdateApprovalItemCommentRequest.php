<?php

namespace App\Http\Requests;

use App\Rules\CommentLength;
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
            'body' => ['required', 'string', new CommentLength],
        ];
    }

    public function messages(): array
    {
        return [
            'body.required' => 'Comment body is required.',
        ];
    }
}
