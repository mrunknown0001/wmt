<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Work recorded against a task.
 *
 * A row is either finished (minutes set) or running (started_at set, minutes
 * null). One person may only have one running row at a time — see TimeTracker.
 */
class TaskTimeLog extends Model
{
    use HasFactory;

    /** A single entry can't exceed a day; anything longer is a mis-key. */
    public const MAX_MINUTES = 1440;

    protected $fillable = [
        'task_id',
        'user_id',
        'minutes',
        'started_at',
        'logged_on',
        'note',
    ];

    protected function casts(): array
    {
        return [
            'minutes' => 'integer',
            'started_at' => 'datetime',
            'logged_on' => 'date:Y-m-d',
        ];
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isRunning(): bool
    {
        return $this->started_at !== null && $this->minutes === null;
    }

    public function scopeRunning(Builder $query): Builder
    {
        return $query->whereNotNull('started_at')->whereNull('minutes');
    }

    /** Only finished entries carry a duration, so only these can be summed. */
    public function scopeCompleted(Builder $query): Builder
    {
        return $query->whereNotNull('minutes');
    }

    /** Minutes elapsed so far on a running timer. */
    public function elapsedMinutes(): int
    {
        if (!$this->isRunning()) {
            return (int) $this->minutes;
        }

        return (int) $this->started_at->diffInMinutes(now());
    }
}
