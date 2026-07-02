<?php

namespace App\Http\Requests;

use App\Models\Setting;
use Illuminate\Foundation\Http\FormRequest;

class StoreTaskCommentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $maxSizeKb = Setting::current()->max_upload_size * 1024;

        return [
            'body' => ['required_without:attachments', 'nullable', 'string', 'max:2000'],
            'attachments' => ['nullable', 'array', 'max:5'],
            'attachments.*' => [
                'file',
                'mimes:jpg,jpeg,png,webp,pdf,mp4,mov,avi,wmv,webm,xls,xlsx,csv',
                "max:{$maxSizeKb}",
            ],
        ];
    }

    public function messages(): array
    {
        $maxMb = Setting::current()->max_upload_size;

        return [
            'attachments.*.max' => "Each file must not exceed {$maxMb}MB.",
            'attachments.*.mimes' => 'Only images (JPG, PNG, WebP), PDF, video (MP4, MOV, AVI, WMV, WebM), and spreadsheets (XLS, XLSX, CSV) are allowed.',
            'attachments.max' => 'You can attach up to 5 files per comment.',
            'body.required_without' => 'A comment must have text or at least one attachment.',
        ];
    }
}
