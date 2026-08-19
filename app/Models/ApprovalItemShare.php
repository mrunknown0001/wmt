<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One person's access to a decided approval request they were not part of.
 *
 * The share is the whole grant: ApprovalItemPolicy::view honours it, and because
 * AttachmentController authorizes attachment reads against that same ability,
 * the files come with it without a second rule.
 */
class ApprovalItemShare extends Model
{
    protected $fillable = [
        'approval_item_id',
        'user_id',
        'shared_by',
    ];

    public function item(): BelongsTo
    {
        return $this->belongsTo(ApprovalItem::class, 'approval_item_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function sharedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'shared_by');
    }
}
