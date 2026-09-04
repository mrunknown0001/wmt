<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One stretch of work on a task: the clock started here and stopped there.
 *
 * Open while the work is going on (ended_at null). The effort generator reads
 * these and nothing else — what a task was worth on a given day is a question
 * about which stretches touched that day.
 */
class TaskMotionSegment extends Model
{
    use HasFactory;

    protected $fillable = ['task_id', 'user_id', 'started_at', 'ended_at'];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
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

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNull('ended_at');
    }

    /** Stretches touching a day at all, open ones included. */
    public function scopeOverlapping(Builder $query, Carbon $from, Carbon $to): Builder
    {
        return $query->where('started_at', '<', $to)
            ->where(fn ($q) => $q->whereNull('ended_at')->orWhere('ended_at', '>', $from));
    }

    /**
     * Minutes of this stretch that fall inside a window.
     *
     * An open stretch is measured to now, or to the end of the window if that
     * came first — a day already past does not keep growing because the clock
     * is still running today.
     */
    public function minutesWithin(Carbon $from, Carbon $to): int
    {
        $start = $this->started_at->greaterThan($from) ? $this->started_at : $from;
        $end = $this->ended_at ?? now();

        if ($end->greaterThan($to)) {
            $end = $to;
        }

        return $end->greaterThan($start) ? (int) $start->diffInMinutes($end) : 0;
    }
}
