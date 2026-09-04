<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Services\MotionEffortGenerator;

/**
 * Work recorded against a task, on one day, for one person.
 *
 * Most rows are the effort generator's: worked out from the task's clock and
 * recalculated whenever the evidence changes. The rest are statements — what
 * somebody said at a pause, or a correction they argued for and had approved —
 * and those are never revised on their author's behalf. `source` says which,
 * and `amended_at` marks a figure that has been through an approval.
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
        'source',
        'logged_on',
        'note',
        'amended_at',
    ];

    protected function casts(): array
    {
        return [
            'minutes' => 'integer',
            'logged_on' => 'date:Y-m-d',
            'amended_at' => 'datetime',
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

    public function amendments(): HasMany
    {
        return $this->hasMany(TimeLogAmendment::class);
    }

    /** The correction waiting on a decision, if one is. */
    public function pendingAmendment(): ?TimeLogAmendment
    {
        return $this->amendments()->pending()->latest('id')->first();
    }

    /**
     * Every row carries a duration now that nothing is left running, but the
     * scope stays: reports and totals were written against it, and "the entries
     * that can be summed" is still the right idea to express at a call site.
     */
    public function scopeCompleted(Builder $query): Builder
    {
        return $query->whereNotNull('minutes');
    }

    /** Worked out from the clock, and so open to being worked out again. */
    public function isGenerated(): bool
    {
        return $this->source === MotionEffortGenerator::MOTION && $this->amended_at === null;
    }

    /** Said by a person: a pause figure, or a correction that was approved. */
    public function isStated(): bool
    {
        return ! $this->isGenerated();
    }
}
