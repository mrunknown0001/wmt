<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Support\Str;

/**
 * A label, shared across everything that can carry one.
 *
 * Identity is the slug, not the name: somebody typing "Budget" and somebody
 * typing "budget" mean the same thing, and a search that treated them as two
 * tags would quietly split the very set the tag exists to gather.
 */
class Tag extends Model
{
    use HasFactory;

    /** Long enough to be a phrase, short enough to stay a label. */
    public const MAX_LENGTH = 40;

    protected $fillable = ['name', 'slug', 'created_by'];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function projects(): MorphToMany
    {
        return $this->morphedByMany(Project::class, 'taggable');
    }

    public function tasks(): MorphToMany
    {
        return $this->morphedByMany(Task::class, 'taggable');
    }

    public function minutes(): MorphToMany
    {
        return $this->morphedByMany(TaskMinute::class, 'taggable');
    }

    /**
     * What a typed name reduces to.
     *
     * Str::slug strips the punctuation people scatter through labels — "Q3
     * budget!", "Q3-budget", "q3 budget" all land on the same tag — and returns
     * an empty string for a name made only of punctuation, which is how the
     * caller knows there was nothing there.
     */
    public static function slugFor(string $name): string
    {
        return Str::slug(trim($name));
    }

    /** Find the tag by that name, or start it. */
    public static function named(string $name, ?int $userId = null): ?self
    {
        $slug = self::slugFor($name);

        if ($slug === '') {
            return null;
        }

        return self::firstOrCreate(
            ['slug' => mb_substr($slug, 0, self::MAX_LENGTH)],
            ['name' => mb_substr(trim($name), 0, self::MAX_LENGTH), 'created_by' => $userId],
        );
    }

    /** Tags nothing carries any more — the tidying candidates. */
    public function scopeUnused(Builder $query): Builder
    {
        return $query->whereDoesntHave('projects')
            ->whereDoesntHave('tasks')
            ->whereDoesntHave('minutes');
    }
}
