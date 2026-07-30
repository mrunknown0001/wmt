<?php

namespace App\Models;

use App\Services\NoteAccess;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Access granted over a whole folder, inherited by its subfolders and by every
 * note filed in any of them.
 */
class NoteFolderShare extends Model
{
    use HasFactory;

    /** Same audience types a single note can be shared with. */
    public const TYPES = NoteShare::TYPES;

    protected $fillable = [
        'note_folder_id',
        'shareable_type',
        'shareable_id',
        'role',
    ];

    protected static function booted(): void
    {
        // Folder access is resolved once per request and cached; a change here
        // has to invalidate it or the rest of the request works from a stale
        // picture of who can see what.
        static::saved(fn () => NoteAccess::flush());
        static::deleted(fn () => NoteAccess::flush());
    }

    public function folder(): BelongsTo
    {
        return $this->belongsTo(NoteFolder::class, 'note_folder_id');
    }

    public function shareable(): MorphTo
    {
        return $this->morphTo();
    }

    public function typeKey(): ?string
    {
        return array_search($this->shareable_type, self::TYPES, true) ?: null;
    }

    public static function classFor(string $typeKey): ?string
    {
        return self::TYPES[$typeKey] ?? null;
    }
}
