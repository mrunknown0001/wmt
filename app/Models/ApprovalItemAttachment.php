<?php

namespace App\Models;

use App\Models\Concerns\HasAttachmentFile;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalItemAttachment extends Model
{
    use HasAttachmentFile;

    protected $fillable = [
        'approval_item_id',
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

    public function item(): BelongsTo
    {
        return $this->belongsTo(ApprovalItem::class, 'approval_item_id');
    }

    public function getUrlAttribute(): string
    {
        return route('attachments.approval-item', $this);
    }
}
