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
        'approval_chain_version_id',
        'title',
        'description',
        'requested_by',
        'status',
        'current_step_number',
        'submitted_at',
        'decided_at',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
            'decided_at' => 'datetime',
        ];
    }

    public function approvalProject(): BelongsTo
    {
        return $this->belongsTo(ApprovalProject::class);
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
