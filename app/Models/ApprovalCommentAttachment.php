<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class ApprovalCommentAttachment extends Model
{
    use HasFactory;

    protected $fillable = [
        'approval_item_comment_id',
        'file_name',
        'file_path',
        'file_type',
        'file_size',
    ];

    public function comment(): BelongsTo
    {
        return $this->belongsTo(ApprovalItemComment::class, 'approval_item_comment_id');
    }

    public function getUrlAttribute(): string
    {
        return Storage::disk('public')->url($this->file_path);
    }

    public function isImage(): bool
    {
        return in_array($this->file_type, ['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    }

    public function isVideo(): bool
    {
        return in_array($this->file_type, ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/x-matroska']);
    }

    public function isSpreadsheet(): bool
    {
        return in_array($this->file_type, ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv']);
    }

    public function isPdf(): bool
    {
        return $this->file_type === 'application/pdf';
    }
}
