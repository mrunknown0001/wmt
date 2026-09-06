<?php

namespace App\Models\Concerns;

use App\Models\Tag;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\MorphToMany;

/**
 * Anything people can label.
 *
 * The whole point of a tag is that it crosses the boundaries the rest of the
 * schema draws, so the behaviour lives here once rather than three times.
 */
trait HasTags
{
    public function tags(): MorphToMany
    {
        return $this->morphToMany(Tag::class, 'taggable')->withTimestamps();
    }

    /**
     * Set this record's labels to exactly these names.
     *
     * Names rather than ids, because that is what the person typed and what the
     * autocomplete hands back — a tag nobody has used yet has no id to send.
     * Anything unrecognisable (punctuation alone, an empty string) is dropped
     * rather than stored as a tag nobody can search for.
     */
    public function syncTagNames(array $names, ?int $userId = null): void
    {
        $ids = collect($names)
            ->filter(fn ($name) => is_string($name))
            ->map(fn ($name) => Tag::named($name, $userId))
            ->filter()
            ->pluck('id')
            ->unique()
            ->values()
            // Who put it there, kept on the pivot: on a shared task it answers
            // "why is this tagged urgent" without anybody having to guess.
            ->mapWithKeys(fn ($id) => [$id => ['tagged_by' => $userId]])
            ->all();

        $this->tags()->sync($ids);
    }

    /** Records carrying every one of these tags — an AND, not an OR. */
    public function scopeTaggedWith(Builder $query, array $slugs): Builder
    {
        foreach (array_filter($slugs) as $slug) {
            $query->whereHas('tags', fn ($t) => $t->where('slug', Tag::slugFor((string) $slug)));
        }

        return $query;
    }

    /**
     * Records carrying at least one of these tags.
     *
     * The other reading of a multiple choice, and the right one for a list of
     * projects: asking for "budget" and "hatchery" together almost always means
     * show me both piles, not the handful of things filed under both.
     */
    public function scopeTaggedWithAny(Builder $query, array $slugs): Builder
    {
        $slugs = collect($slugs)
            ->filter()
            ->map(fn ($slug) => Tag::slugFor((string) $slug))
            ->filter()
            ->unique()
            ->values()
            ->all();

        if (! $slugs) {
            return $query;
        }

        return $query->whereHas('tags', fn ($t) => $t->whereIn('slug', $slugs));
    }

    /** Records carrying a tag whose name looks like this. */
    public function scopeTagMatching(Builder $query, string $like): Builder
    {
        return $query->whereHas('tags', fn ($t) => $t->where('name', 'like', $like));
    }
}
