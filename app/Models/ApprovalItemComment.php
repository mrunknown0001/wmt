<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ApprovalItemComment extends Model
{
    use HasFactory;

    protected $fillable = [
        'approval_item_id',
        'user_id',
        'body',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(ApprovalItem::class, 'approval_item_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(ApprovalCommentAttachment::class, 'approval_item_comment_id');
    }
}
