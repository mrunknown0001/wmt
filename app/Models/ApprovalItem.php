<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ApprovalItem extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'approval_project_id',
        'approval_section_id',
        'approval_chain_version_id',
        'title',
        'description',
        'requested_by',
        'status',
        'current_step_number',
        'submitted_at',
        'decided_at',
        'archived_at',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
            'decided_at' => 'datetime',
            'archived_at' => 'datetime',
        ];
    }

    public function scopeArchived($query)
    {
        return $query->whereNotNull('archived_at');
    }

    public function scopeNotArchived($query)
    {
        return $query->whereNull('archived_at');
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    protected static function booted(): void
    {
        // When an approval item is soft-deleted, auto-cancel any open step
        // instances so the item never lingers in an approver's pending queue.
        // Force-deletes remove the rows outright, so there's nothing to cancel.
        static::deleting(function (ApprovalItem $item) {
            if ($item->isForceDeleting()) {
                return;
            }

            $item->stepInstances()
                ->whereIn('status', ['active', 'pending'])
                ->update(['status' => 'cancelled', 'completed_at' => now()]);
        });
    }

    public function approvalProject(): BelongsTo
    {
        return $this->belongsTo(ApprovalProject::class);
    }

    public function section(): BelongsTo
    {
        // Explicit FK — the column is approval_section_id, not the section_id
        // Eloquent would infer from the method name.
        return $this->belongsTo(ApprovalSection::class, 'approval_section_id');
    }

    public function chainVersion(): BelongsTo
    {
        return $this->belongsTo(ApprovalChainVersion::class, 'approval_chain_version_id');
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function customFieldValues(): HasMany
    {
        return $this->hasMany(ApprovalItemCustomFieldValue::class);
    }

    public function stepInstances(): HasMany
    {
        return $this->hasMany(ApprovalStepInstance::class)->orderBy('step_number');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(ApprovalItemComment::class)->orderBy('created_at', 'desc');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(ApprovalItemAttachment::class);
    }
}
