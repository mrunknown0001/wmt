<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Someone else holding a person's tasks while they are away.
 *
 * Unlike approval delegation, this one *replaces* rather than adds: a task has
 * one assignee, so the stand-in takes it and the original gets it back when the
 * period ends. Every move is written to task_delegation_items, which is what
 * makes the hand-back exact rather than a guess.
 */
class TaskDelegation extends Model
{
    use HasFactory;

    public const SCHEDULED = 'scheduled';
    public const ACTIVE = 'active';
    public const ENDED = 'ended';

    /** At most two stand-ins: past that, nobody can say who is covering what. */
    public const MAX_DELEGATES = 2;

    protected $fillable = [
        'user_id',
        // Null covers everything the person holds; set narrows this arrangement
        // to a single task, leaving the rest of their workload with them.
        'task_id',
        'starts_on',
        'ends_on',
        'reason',
        'status',
        'activated_at',
        'ended_at',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'starts_on' => 'date:Y-m-d',
            'ends_on' => 'date:Y-m-d',
            'activated_at' => 'datetime',
            'ended_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** The one task this arrangement covers, or null for whole-person cover. */
    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class, 'task_id');
    }

    /** Cover for a single task rather than the person's whole workload. */
    public function isPerTask(): bool
    {
        return $this->task_id !== null;
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function delegates(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'task_delegation_delegates')
            ->withPivot('position')
            ->orderBy('task_delegation_delegates.position');
    }

    public function items(): HasMany
    {
        return $this->hasMany(TaskDelegationItem::class);
    }

    /** Running right now: within its dates and already switched on. */
    public function scopeRunning(Builder $query, ?Carbon $date = null): Builder
    {
        $day = ($date ?? now())->toDateString();

        return $query->where('status', self::ACTIVE)
            ->whereDate('starts_on', '<=', $day)
            ->whereDate('ends_on', '>=', $day);
    }

    /** Due to start on or before the given day but not yet switched on. */
    public function scopeDueToStart(Builder $query, ?Carbon $date = null): Builder
    {
        return $query->where('status', self::SCHEDULED)
            ->whereDate('starts_on', '<=', ($date ?? now())->toDateString());
    }

    /** Running, but its last day has passed. */
    public function scopeDueToEnd(Builder $query, ?Carbon $date = null): Builder
    {
        return $query->where('status', self::ACTIVE)
            ->whereDate('ends_on', '<', ($date ?? now())->toDateString());
    }

    /** Whether the given day falls inside the period, regardless of status. */
    public function covers(?Carbon $date = null): bool
    {
        $day = ($date ?? now())->startOfDay();

        return $this->starts_on->startOfDay()->lessThanOrEqualTo($day)
            && $this->ends_on->startOfDay()->greaterThanOrEqualTo($day);
    }

    public function isRunning(?Carbon $date = null): bool
    {
        return $this->status === self::ACTIVE && $this->covers($date);
    }

    /** "12 Aug 2026 — 20 Aug 2026" */
    public function periodLabel(): string
    {
        return $this->starts_on->format('j M Y') . ' — ' . $this->ends_on->format('j M Y');
    }
}
