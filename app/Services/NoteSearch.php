<?php

namespace App\Services;

use App\Models\Note;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Search across the notes a user can see.
 *
 * Separate from the app-wide search because notes want different behaviour:
 * the body is searched as well as the title, every hit carries a snippet of the
 * matching text, and results are ranked by where the term appeared rather than
 * by how recently the note was touched.
 *
 * Matching is LIKE-based. At the volumes a personal notebook reaches that is
 * comfortably fast; a full-text index would be the next step if a single user
 * ever accumulates tens of thousands of notes.
 */
class NoteSearch
{
    /** Ranks, lowest first — a title hit is almost always the intended note. */
    private const RANK_TITLE_EXACT = 0;
    private const RANK_TITLE = 1;
    private const RANK_BODY = 2;

    /** Characters either side of a match in the snippet. */
    private const SNIPPET_PAD = 60;

    public static function apply(Builder $query, ?string $term): Builder
    {
        $term = trim((string) $term);

        if ($term === '') {
            return $query;
        }

        // Escape the LIKE wildcards, or a note titled "50% done" would be
        // unsearchable and "_" would quietly match any single character.
        $like = '%' . addcslashes($term, '%_\\') . '%';

        return $query->where(function (Builder $q) use ($like) {
            $q->where('title', 'like', $like)
                ->orWhere('content_text', 'like', $like);
        });
    }

    /**
     * Decorate results with a snippet and sort them by relevance.
     *
     * @param  Collection<int, Note>  $notes
     */
    public static function rank(Collection $notes, ?string $term): Collection
    {
        $term = trim((string) $term);

        if ($term === '') {
            return $notes;
        }

        return $notes
            ->map(function (Note $note) use ($term) {
                $note->setAttribute('search_snippet', self::snippet($note->content_text, $term));
                $note->setAttribute('search_rank', self::rankOf($note, $term));

                return $note;
            })
            ->sortBy([
                ['search_rank', 'asc'],
                ['updated_at', 'desc'],
            ])
            ->values();
    }

    private static function rankOf(Note $note, string $term): int
    {
        $title = mb_strtolower((string) $note->title);
        $needle = mb_strtolower($term);

        if ($title === $needle) {
            return self::RANK_TITLE_EXACT;
        }

        return str_contains($title, $needle) ? self::RANK_TITLE : self::RANK_BODY;
    }

    /**
     * A window of the body around the first match, so the result list shows why
     * the note matched rather than just its opening line.
     */
    public static function snippet(?string $text, string $term): ?string
    {
        $text = trim((string) $text);

        if ($text === '') {
            return null;
        }

        $position = mb_stripos($text, $term);

        if ($position === false) {
            return null; // matched on the title only
        }

        $start = max(0, $position - self::SNIPPET_PAD);
        $length = mb_strlen($term) + (self::SNIPPET_PAD * 2);
        $slice = mb_substr($text, $start, $length);

        return ($start > 0 ? '…' : '') . $slice . ($start + $length < mb_strlen($text) ? '…' : '');
    }

    /** Everything the user can see, ready for further filtering. */
    public static function visibleQuery(User $user): Builder
    {
        return Note::query()->visibleTo($user);
    }
}
