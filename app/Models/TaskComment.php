<?php

namespace App\Models;

use App\Events\TaskMetaUpdated;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TaskComment extends Model
{
    protected $fillable = [
        'task_id',
        'user_id',
        'body',
    ];

    protected static function booted(): void
    {
        $broadcastMeta = function (self $comment): void {
            if ($comment->task?->project_id) {
                broadcast(new TaskMetaUpdated($comment->task));
            }
        };

        static::created($broadcastMeta);
        static::deleted($broadcastMeta);
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(CommentAttachment::class);
    }
}
