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

    /** Change what an entry says, or add one that was never recorded. */
    public const AMEND = 'amend';
    public const ADD = 'add';

    public const PENDING = 'pending';
    public const APPROVED = 'approved';
    public const REJECTED = 'rejected';

    protected $fillable = [
        'task_time_log_id',
        'kind',
        'task_id',
        'logged_on',
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
            'logged_on' => 'date:Y-m-d',
            'reviewed_at' => 'datetime',
        ];
    }

    public function timeLog(): BelongsTo
    {
        return $this->belongsTo(TaskTimeLog::class, 'task_time_log_id');
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
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

    /**
     * The corrections this person decides.
     *
     * The same rule as TimeLogAmendmentController::canReview — whoever runs the
     * project — asked of a whole list rather than one row at a time. Kept in SQL
     * because an inbox cannot afford to load every amendment in the system and
     * then filter them in PHP.
     */
    public function scopeDecidableBy(Builder $query, User $user): Builder
    {
        // Project managers run every project, so the only condition left is
        // that the entry belongs to one at all: a standalone task has no owner
        // to decide anything.
        // An addition names its task directly; an amendment reaches one through
        // the entry it corrects. Both have to be matched, or half the queue
        // would go missing.
        $runsIt = function ($q) use ($user) {
            if ($user->can('manage-projects')) {
                $q->whereNotNull('project_id');

                return;
            }

            $q->whereHas('project', function ($p) use ($user) {
                $p->where('owner_id', $user->id)
                    ->orWhereHas('members', fn ($m) => $m
                        ->where('users.id', $user->id)
                        ->where('project_members.role', 'admin'));
            });
        };

        return $query->where(fn ($q) => $q
            ->whereHas('timeLog.task', $runsIt)
            ->orWhereHas('task', $runsIt));
    }

    public function isPending(): bool
    {
        return $this->status === self::PENDING;
    }

    public function isAddition(): bool
    {
        return $this->kind === self::ADD;
    }

    /** The task this concerns, whether through an entry or on its own. */
    public function subjectTask(): ?Task
    {
        return $this->timeLog?->task ?? $this->task;
    }
}
