<?php

namespace App\Models;

use App\Events\TaskMetaUpdated;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskAttachment extends Model
{
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

    public function getUrlAttribute(): string
    {
        return asset('storage/' . $this->file_path);
    }

    public function isImage(): bool
    {
        return str_starts_with($this->file_type, 'image/');
    }

    public function isVideo(): bool
    {
        return str_starts_with($this->file_type, 'video/');
    }

    public function isSpreadsheet(): bool
    {
        return in_array($this->file_type, [
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }
}
