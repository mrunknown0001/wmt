<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Facades\DB;

class Folder extends Model
{
    use HasFactory;

    // Maximum user folder nesting (0-indexed): 5 levels below a system folder or root
    public const MAX_USER_DEPTH = 4;

    protected $fillable = [
        'name',
        'parent_id',
        'depth',
        'user_depth',
        'path',
        'source_type',
        'source_id',
        'created_by',
        'position',
    ];

    protected static function booted(): void
    {
        static::created(function (Folder $folder) {
            $parentPath = $folder->parent_id
                ? Folder::find($folder->parent_id)->path
                : '/';
            $folder->updateQuietly(['path' => $parentPath . $folder->id . '/']);
        });
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Folder::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Folder::class, 'parent_id')->orderBy('position')->orderBy('name');
    }

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    public function source(): MorphTo
    {
        return $this->morphTo();
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isSystem(): bool
    {
        return $this->source_type !== null;
    }

    public function descendants(): Builder
    {
        return Folder::query()
            ->where('path', 'like', $this->path . '%')
            ->where('id', '!=', $this->id);
    }

    public function isAncestorOf(Folder $other): bool
    {
        return str_starts_with($other->path, $this->path) && $other->id !== $this->id;
    }

    /**
     * The user_depth a user-created folder would have under the given parent.
     * User nesting resets to 0 under system folders and at the root.
     */
    public static function userDepthUnder(?Folder $parent): int
    {
        if (!$parent || $parent->isSystem()) {
            return 0;
        }

        return $parent->user_depth + 1;
    }

    /**
     * Re-parent this folder and rewrite path/depth/user_depth for its whole subtree.
     * Callers are responsible for cycle and depth validation.
     */
    public function moveTo(?Folder $newParent): void
    {
        DB::transaction(function () use ($newParent) {
            $oldPath = $this->path;
            $newPath = ($newParent?->path ?? '/') . $this->id . '/';
            $depthDelta = (($newParent?->depth ?? -1) + 1) - $this->depth;
            $userDepthDelta = $this->isSystem()
                ? 0
                : self::userDepthUnder($newParent) - $this->user_depth;

            $this->update(['parent_id' => $newParent?->id]);

            // Paths are unique id chains, so the old prefix occurs exactly once per row
            DB::update(
                'UPDATE folders
                 SET path = REPLACE(path, ?, ?),
                     depth = depth + ?,
                     user_depth = CASE WHEN user_depth IS NULL THEN NULL ELSE user_depth + ? END
                 WHERE path LIKE ?',
                [$oldPath, $newPath, $depthDelta, $userDepthDelta, $oldPath . '%']
            );
        });

        $this->refresh();
    }
}
