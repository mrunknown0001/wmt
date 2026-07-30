<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class NoteShare extends Model
{
    use HasFactory;

    /** Audience types a note may be shared with, keyed by the value the UI sends. */
    public const TYPES = [
        'user' => User::class,
        'team' => Team::class,
        'department' => Department::class,
        'division' => Division::class,
    ];

    protected $fillable = [
        'note_id',
        'shareable_type',
        'shareable_id',
        'role',
    ];

    protected static function booted(): void
    {
        // Access is resolved once per request and cached; a change here has to
        // invalidate it or the rest of the request works from a stale picture.
        static::saved(fn () => \App\Services\NoteAccess::flush());
        static::deleted(fn () => \App\Services\NoteAccess::flush());
    }

    public function note(): BelongsTo
    {
        return $this->belongsTo(Note::class);
    }

    public function shareable(): MorphTo
    {
        return $this->morphTo();
    }

    /** 'user' | 'team' | 'department' | 'division' — the short key the UI uses. */
    public function typeKey(): ?string
    {
        return array_search($this->shareable_type, self::TYPES, true) ?: null;
    }

    public static function classFor(string $typeKey): ?string
    {
        return self::TYPES[$typeKey] ?? null;
    }
}
