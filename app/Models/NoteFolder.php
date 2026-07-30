<?php

namespace App\Models;

use App\Services\NoteAccess;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A user's own filing for their notes.
 *
 * Folders are personal: sharing happens per note, so two people who share a
 * note can each file it wherever it makes sense to them without disturbing the
 * other's arrangement.
 */
class NoteFolder extends Model
{
    use HasFactory, SoftDeletes;

    /** Nesting depth allowed below the root, 0-indexed. */
    public const MAX_DEPTH = 3;

    protected $fillable = [
        'user_id',
        'name',
        'parent_id',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'position' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::created(fn (self $folder) => $folder->syncPath());

        // Moving a folder moves its whole subtree, so every descendant's trail
        // has to be rewritten too — otherwise a share on the new parent would
        // not reach them, and a share on the old one still would.
        static::updated(function (self $folder) {
            if ($folder->wasChanged('parent_id')) {
                $folder->syncPath(true);
                NoteAccess::flush();
            }
        });
    }

    /**
     * Recompute this folder's ancestor trail, e.g. "/3/7/".
     *
     * The attribute is set directly rather than passed through update(): `path`
     * is derived, so it is deliberately not fillable and mass assignment would
     * drop it on the floor. saveQuietly keeps a subtree rewrite from recursing
     * through the updated hook once per folder.
     */
    public function syncPath(bool $withDescendants = false): void
    {
        $parentPath = $this->parent_id
            ? (self::withTrashed()->whereKey($this->parent_id)->value('path') ?: '/')
            : '/';

        $this->path = $parentPath . $this->id . '/';
        $this->saveQuietly();

        if ($withDescendants) {
            self::where('parent_id', $this->id)->get()
                ->each(fn (self $child) => $child->syncPath(true));
        }
    }

    public function shares(): HasMany
    {
        return $this->hasMany(NoteFolderShare::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('position')->orderBy('name');
    }

    public function notes(): HasMany
    {
        return $this->hasMany(Note::class);
    }

    /** How deep this folder sits, walking up to the root. */
    public function depth(): int
    {
        $depth = 0;
        $parent = $this->parent;

        while ($parent && $depth <= self::MAX_DEPTH + 1) {
            $depth++;
            $parent = $parent->parent;
        }

        return $depth;
    }

    /**
     * True when moving this folder under $parentId would put a folder inside
     * itself. Without this a folder and its subtree would vanish from the tree,
     * since nothing walking down from the root would ever reach them.
     */
    public function wouldCycle(?int $parentId): bool
    {
        if (!$parentId) {
            return false;
        }

        if ($parentId === $this->id) {
            return true;
        }

        $seen = 0;
        $candidate = self::find($parentId);

        while ($candidate && $seen <= self::MAX_DEPTH + 2) {
            if ((int) $candidate->id === (int) $this->id) {
                return true;
            }
            $candidate = $candidate->parent;
            $seen++;
        }

        return false;
    }
}
