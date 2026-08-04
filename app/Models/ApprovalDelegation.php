<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Someone standing in for an approver while they are away.
 *
 * The delegate is added *alongside* the original approver rather than replacing
 * them: either can act. Replacing would strand the approval if the person came
 * back early, and would quietly remove authority the chain granted them.
 */
class ApprovalDelegation extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'delegate_id',
        'starts_on',
        'ends_on',
        'reason',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'starts_on' => 'date:Y-m-d',
            'ends_on' => 'date:Y-m-d',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function delegate(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegate_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** In force on the given day — inclusive of both ends. */
    public function scopeActiveOn(Builder $query, ?Carbon $date = null): Builder
    {
        $date = ($date ?? now())->toDateString();

        return $query->whereDate('starts_on', '<=', $date)
            ->where(function (Builder $q) use ($date) {
                $q->whereNull('ends_on')->orWhereDate('ends_on', '>=', $date);
            });
    }

    public function isActive(?Carbon $date = null): bool
    {
        $date = ($date ?? now())->startOfDay();

        if ($this->starts_on->startOfDay()->greaterThan($date)) {
            return false;
        }

        return $this->ends_on === null || $this->ends_on->startOfDay()->greaterThanOrEqualTo($date);
    }

    /** "12 Aug — 20 Aug", or "from 12 Aug" when open-ended. */
    public function periodLabel(): string
    {
        $from = $this->starts_on->format('j M Y');

        return $this->ends_on
            ? $from . ' — ' . $this->ends_on->format('j M Y')
            : 'from ' . $from;
    }
}
