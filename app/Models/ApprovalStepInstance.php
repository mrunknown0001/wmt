<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ApprovalStepInstance extends Model
{
    use HasFactory;

    protected $fillable = [
        'approval_item_id',
        'approval_step_id',
        'step_number',
        'attempt_number',
        'status',
        'quorum_required',
        'activated_at',
        'completed_at',
        'due_at',
        'reminded_at',
        'escalated_at',
    ];

    protected function casts(): array
    {
        return [
            'activated_at' => 'datetime',
            'completed_at' => 'datetime',
            'due_at' => 'datetime',
            'reminded_at' => 'datetime',
            'escalated_at' => 'datetime',
        ];
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(ApprovalItem::class, 'approval_item_id');
    }

    public function step(): BelongsTo
    {
        return $this->belongsTo(ApprovalStep::class, 'approval_step_id');
    }

    public function approvers(): HasMany
    {
        return $this->hasMany(ApprovalStepInstanceApprover::class);
    }

    public function decisions(): HasMany
    {
        return $this->hasMany(ApprovalStepDecision::class);
    }
}
