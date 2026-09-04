<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A request to change the minutes on one time log, and its decision.
 *
 * Pending until somebody who runs the project decides. Approving writes the new
 * figure onto the log; rejecting leaves it exactly as it was. Either way the
 * row stays, because "this entry was corrected, by whom, and why" is the part
 * that makes an amended timesheet trustworthy.
 */
class TimeLogAmendment extends Model
{
    use HasFactory;

    public const PENDING = 'pending';
    public const APPROVED = 'approved';
    public const REJECTED = 'rejected';

    protected $fillable = [
        'task_time_log_id',
        'requested_by',
        'original_minutes',
        'requested_minutes',
        'reason',
        'status',
        'reviewed_by',
        'reviewed_at',
        'review_note',
    ];

    protected function casts(): array
    {
        return [
            'original_minutes' => 'integer',
            'requested_minutes' => 'integer',
            'reviewed_at' => 'datetime',
        ];
    }

    public function timeLog(): BelongsTo
    {
        return $this->belongsTo(TaskTimeLog::class, 'task_time_log_id');
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', self::PENDING);
    }

    public function isPending(): bool
    {
        return $this->status === self::PENDING;
    }
}
