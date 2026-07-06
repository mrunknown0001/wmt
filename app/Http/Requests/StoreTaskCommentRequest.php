<?php

namespace App\Http\Requests;

use App\Rules\CommentAttachmentFile;
use Illuminate\Foundation\Http\FormRequest;

class StoreTaskCommentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'body' => ['required_without:attachments', 'nullable', 'string', 'max:2000'],
            'attachments' => ['nullable', 'array', 'max:5'],
            'attachments.*' => ['file', new CommentAttachmentFile],
        ];
    }

    public function messages(): array
    {
        return [
            'attachments.max' => 'You can attach up to 5 files per comment.',
            'body.required_without' => 'A comment must have text or at least one attachment.',
        ];
    }
}
