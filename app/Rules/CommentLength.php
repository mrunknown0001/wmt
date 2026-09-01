<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * A comment's length as the person writing it sees it.
 *
 * Comments are rich text, so the stored value is HTML. Measuring that string
 * counted the markup too: a comment of a few short paragraphs spent hundreds of
 * characters on <p> tags, and the editor's own counter — which counts what was
 * typed — would have promised room the server then refused.
 *
 * So the visible text is what is limited, and the raw string carries a separate,
 * much larger ceiling. The second is not a writing limit; it is there so no
 * amount of markup can push the column past what it holds.
 */
class CommentLength implements ValidationRule
{
    /** What a person may type. Mirrored by COMMENT_LIMIT in resources/js/limits.js. */
    public const VISIBLE = 2000;

    /** All the markup that visible text could reasonably need, and no more. */
    public const RAW = 20000;

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)) {
            return;
        }

        if (mb_strlen($value) > self::RAW) {
            $fail('The :attribute is too long.');

            return;
        }

        if (self::visibleLength($value) > self::VISIBLE) {
            $fail('The :attribute may not be longer than '.self::VISIBLE.' characters.');
        }
    }

    /**
     * The characters a person actually typed.
     *
     * Deliberately the same measure the editor's counter uses — TipTap's
     * character count in textSize mode, which counts text and nothing else.
     * Paragraph breaks are free on both sides; a limit that disagreed with the
     * number on screen by even one character would be worse than no number.
     */
    public static function visibleLength(string $html): int
    {
        $text = strip_tags($html);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return mb_strlen($text);
    }
}
