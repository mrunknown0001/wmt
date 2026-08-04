<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One task's stay with a stand-in.
 *
 * The ledger the hand-back reads from. Without it, returning a task would mean
 * assuming the delegation's owner was the previous holder — which is wrong the
 * moment anyone reassigns something by hand mid-period.
 */
class TaskDelegationItem extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'task_delegation_id',
        'task_id',
        'original_assignee_id',
        'delegate_id',
        'assigned_at',
        'restored_at',
    ];

    protected function casts(): array
    {
        return [
            'assigned_at' => 'datetime',
            'restored_at' => 'datetime',
        ];
    }

    public function delegation(): BelongsTo
    {
        return $this->belongsTo(TaskDelegation::class, 'task_delegation_id');
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function delegate(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegate_id');
    }

    public function originalAssignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'original_assignee_id');
    }
}
