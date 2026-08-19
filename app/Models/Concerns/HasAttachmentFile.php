<?php

namespace App\Models\Concerns;

use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Shared behaviour for the four attachment models — task files, task comment
 * files, approval request files and approval comment files. They carry the same
 * four columns (file_path, file_name, file_type, file_size) and all live on the
 * private 'attachments' disk.
 *
 * Each using model supplies its own `getUrlAttribute()` pointing at the
 * AttachmentController route that authorizes reads of that particular kind.
 */
trait HasAttachmentFile
{
    /**
     * The one disk attachments are written to and read from. Private by design;
     * see the note in config/filesystems.php for why it isn't the public disk.
     */
    public const DISK = 'attachments';

    public static function disk()
    {
        return Storage::disk(self::DISK);
    }

    /**
     * Stream the file back under the name the uploader gave it. Callers are
     * responsible for authorizing the read first.
     */
    public function toDownloadResponse(): StreamedResponse
    {
        // A row whose file is missing (pruned, half-failed upload) is a 404
        // rather than a 500 from the filesystem driver.
        abort_unless(self::disk()->exists($this->file_path), 404);

        return self::disk()->download($this->file_path, $this->file_name);
    }

    /** Remove the stored file. Safe to call when it is already gone. */
    public function deleteFile(): void
    {
        self::disk()->delete($this->file_path);
    }

    public function isImage(): bool
    {
        return str_starts_with((string) $this->file_type, 'image/');
    }

    public function isVideo(): bool
    {
        return str_starts_with((string) $this->file_type, 'video/');
    }

    public function isSpreadsheet(): bool
    {
        return in_array($this->file_type, [
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ], true);
    }
}
