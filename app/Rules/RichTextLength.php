<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Rich text measured as the person writing it sees it.
 *
 * The stored value is HTML, so measuring that string counted the markup too: a
 * few short paragraphs spent hundreds of characters on <p> tags, and an
 * editor's counter — which counts what was typed — would have promised room the
 * server then refused.
 *
 * So the visible text is what is limited, and the raw string carries a separate,
 * much larger ceiling. The second is not a writing limit; it is there so no
 * amount of markup can push a column past what it holds.
 */
class RichTextLength implements ValidationRule
{
    public function __construct(
        /** What a person may type. */
        public readonly int $visible,
        /** All the markup that visible text could reasonably need, and no more. */
        public readonly int $raw = 0,
    ) {
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)) {
            return;
        }

        $raw = $this->raw ?: $this->visible * 10;

        if (mb_strlen($value) > $raw) {
            $fail('The :attribute is too long.');

            return;
        }

        if (self::visibleLength($value) > $this->visible) {
            $fail('The :attribute may not be longer than '.$this->visible.' characters.');
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
