<?php

namespace App\Models;

use App\Events\TaskMetaUpdated;
use App\Models\Concerns\HasAttachmentFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskAttachment extends Model
{
    use HasAttachmentFile;

    protected $fillable = [
        'task_id',
        'file_name',
        'file_path',
        'file_type',
        'file_size',
    ];

    protected static function booted(): void
    {
        $broadcastMeta = function (self $attachment): void {
            if ($attachment->task?->project_id) {
                broadcast(new TaskMetaUpdated($attachment->task));
            }
        };

        static::created($broadcastMeta);
        static::deleted($broadcastMeta);
    }

    protected function casts(): array
    {
        return [
            'file_size' => 'integer',
        ];
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    /**
     * Points at the authorizing download route, not at the file. The route is
     * flat (keyed on the attachment alone) so rendering a list of attachments
     * doesn't have to load each one's task to work out whether it belongs to a
     * project or is standalone.
     */
    public function getUrlAttribute(): string
    {
        return route('attachments.task', $this);
    }
}
