<?php

namespace App\Models;

use App\Models\Concerns\HasAttachmentFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CommentAttachment extends Model
{
    use HasAttachmentFile;

    protected $fillable = [
        'task_comment_id',
        'file_name',
        'file_path',
        'file_type',
        'file_size',
    ];

    protected function casts(): array
    {
        return [
            'file_size' => 'integer',
        ];
    }

    public function comment(): BelongsTo
    {
        return $this->belongsTo(TaskComment::class, 'task_comment_id');
    }

    public function getUrlAttribute(): string
    {
        return route('attachments.task-comment', $this);
    }
}
