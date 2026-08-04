<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ApprovalStep extends Model
{
    use HasFactory;

    protected $fillable = [
        'approval_chain_version_id',
        'step_number',
        'name',
        'approver_type',
        'approver_config',
        'quorum_mode',
        'quorum_count',
        'skip_conditions',
        'on_reject_override',
        'fallback_user_id',
        'parallel_group',
        'sla_hours',
    ];

    protected function casts(): array
    {
        return [
            'approver_config' => 'array',
            'skip_conditions' => 'array',
        ];
    }

    public function chainVersion(): BelongsTo
    {
        return $this->belongsTo(ApprovalChainVersion::class, 'approval_chain_version_id');
    }

    public function fallbackUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'fallback_user_id');
    }

    public function instances(): HasMany
    {
        return $this->hasMany(ApprovalStepInstance::class);
    }
}
