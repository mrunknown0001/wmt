<?php

namespace App\Http\Requests;

use App\Rules\CommentLength;
use App\Rules\CommentAttachmentFile;
use Illuminate\Foundation\Http\FormRequest;

class StoreApprovalItemCommentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'body' => ['required_without:attachments', 'nullable', 'string', new CommentLength],
            'attachments' => 'nullable|array|max:5',
            'attachments.*' => ['file', new CommentAttachmentFile()],
        ];
    }

    public function messages(): array
    {
        return [
            'body.required_without' => 'Please provide a comment or attach files.',
            'attachments.max' => 'You can attach a maximum of 5 files.',
        ];
    }
}
