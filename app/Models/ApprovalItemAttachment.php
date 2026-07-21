<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalItemAttachment extends Model
{
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
