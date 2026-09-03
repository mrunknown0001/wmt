<?php

namespace App\Rules;

use App\Models\Setting;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Http\UploadedFile;

class CommentAttachmentFile implements ValidationRule
{
    private const VIDEO_MAX_MB = 50;

    private const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', '3gp', 'mkv'];

    private const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

    private const SPREADSHEET_EXTENSIONS = ['xlsx', 'xls', 'csv'];

    private const DOCUMENT_EXTENSIONS = ['docx'];

    private const OTHER_EXTENSIONS = ['pdf'];

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!$value instanceof UploadedFile) {
            $fail('The :attribute must be a file.');
            return;
        }

        $extension = strtolower($value->getClientOriginalExtension());
        $mimeType = $value->getMimeType();
        $sizeBytes = $value->getSize();

        $isVideo = in_array($extension, self::VIDEO_EXTENSIONS) || str_starts_with($mimeType, 'video/');
        $isImage = in_array($extension, self::IMAGE_EXTENSIONS);
        $isSpreadsheet = in_array($extension, self::SPREADSHEET_EXTENSIONS);
        $isDocument = in_array($extension, self::DOCUMENT_EXTENSIONS);
        $isOther = in_array($extension, self::OTHER_EXTENSIONS);

        if (!$isVideo && !$isImage && !$isSpreadsheet && !$isDocument && !$isOther) {
            $fail('Only images (JPG, PNG, WebP), PDF, Word (DOCX), videos (MP4, MOV, WebM, 3GP, MKV), and spreadsheets (XLSX, XLS, CSV) are allowed.');
            return;
        }

        if ($isVideo) {
            $maxBytes = self::VIDEO_MAX_MB * 1024 * 1024;
            if ($sizeBytes > $maxBytes) {
                $fail('Video files must not exceed ' . self::VIDEO_MAX_MB . 'MB.');
            }
        } else {
            $maxMb = Setting::current()->max_upload_size;
            $maxBytes = $maxMb * 1024 * 1024;
            if ($sizeBytes > $maxBytes) {
                $fail("Each file must not exceed {$maxMb}MB.");
            }
        }
    }
}
