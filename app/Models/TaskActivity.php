<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TaskActivity extends Model
{
    /**
     * old_value, new_value and description are VARCHAR(255).
     *
     * Capped here rather than at each call site because an over-length value
     * throws a PDOException ("Data too long for column") that fails the entire
     * request — so editing a task description longer than 255 characters made
     * the save blow up, even though the activity log is incidental to it.
     */
    private const MAX_LENGTH = 255;

    protected $fillable = [
        'task_id',
        'user_id',
        'field',
        'old_value',
        'new_value',
        'description',
    ];

    protected function oldValue(): Attribute
    {
        return Attribute::set(fn ($value) => self::fit($value));
    }

    protected function newValue(): Attribute
    {
        return Attribute::set(fn ($value) => self::fit($value));
    }

    protected function description(): Attribute
    {
        return Attribute::set(fn ($value) => self::fit($value));
    }

    /** Trim to the column width, marking the cut so it doesn't read as the whole value. */
    private static function fit($value): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = (string) $value;

        if (mb_strlen($value) <= self::MAX_LENGTH) {
            return $value;
        }

        return mb_substr($value, 0, self::MAX_LENGTH - 1) . '…';
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
