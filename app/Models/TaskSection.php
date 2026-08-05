<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Validation\ValidationException;

/**
 * A column on the board, optionally with one level of sub-sections beneath it.
 *
 * Depth is capped at one on purpose. The column allows any depth, so the limit
 * lives here where every write passes through it, rather than in whichever
 * controller happened to be written last.
 */
class TaskSection extends Model
{
    protected $fillable = ['project_id', 'parent_id', 'name', 'color', 'position'];

    protected static function booted(): void
    {
        static::saving(function (TaskSection $section) {
            if ($section->parent_id === null) {
                return;
            }

            if ((int) $section->parent_id === (int) $section->getKey()) {
                throw ValidationException::withMessages([
                    'parent_id' => 'A section cannot sit inside itself.',
                ]);
            }

            $parent = static::find($section->parent_id);

            if (!$parent) {
                throw ValidationException::withMessages([
                    'parent_id' => 'That section no longer exists.',
                ]);
            }

            if ((int) $parent->project_id !== (int) $section->project_id) {
                throw ValidationException::withMessages([
                    'parent_id' => 'A sub-section has to sit under a section of the same project.',
                ]);
            }

            // The rule that keeps this one level deep.
            if ($parent->parent_id !== null) {
                throw ValidationException::withMessages([
                    'parent_id' => 'Sub-sections cannot be nested any further.',
                ]);
            }

            // Turning a section that already has children into a child would
            // create a third level by the back door.
            if ($section->exists && $section->children()->exists()) {
                throw ValidationException::withMessages([
                    'parent_id' => 'This section has sub-sections of its own, so it cannot become one.',
                ]);
            }
        });
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('position');
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class, 'section_id');
    }

    /** Top-level sections only — the columns themselves. */
    public function scopeRoots(Builder $query): Builder
    {
        return $query->whereNull('parent_id');
    }

    public function isSubsection(): bool
    {
        return $this->parent_id !== null;
    }

    /** "Requests › 2026-08", for anywhere a section is named out of context. */
    public function fullName(): string
    {
        return $this->parent_id
            ? ($this->parent?->name . ' › ' . $this->name)
            : $this->name;
    }
}
