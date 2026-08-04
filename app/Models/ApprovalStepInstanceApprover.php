<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalStepInstanceApprover extends Model
{
    use HasFactory;

    protected $fillable = [
        'approval_step_instance_id',
        'user_id',
        'delegated_from_user_id',
    ];

    public function instance(): BelongsTo
    {
        return $this->belongsTo(ApprovalStepInstance::class, 'approval_step_instance_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Set when this approver is standing in for someone who is away. */
    public function delegatedFrom(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegated_from_user_id');
    }

    public function isDelegated(): bool
    {
        return $this->delegated_from_user_id !== null;
    }
}
