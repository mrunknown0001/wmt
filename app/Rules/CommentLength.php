<?php

namespace App\Rules;

/**
 * A comment's length, in the characters its author typed.
 *
 * A named RichTextLength: comments are the oldest user of this measure and the
 * limit is quoted in the UI, so it keeps a name rather than a bare number at
 * five call sites.
 */
class CommentLength extends RichTextLength
{
    /** Mirrored by COMMENT_LIMIT in resources/js/limits.js. */
    public const VISIBLE = 2000;

    public const RAW = 20000;

    public function __construct()
    {
        parent::__construct(self::VISIBLE, self::RAW);
    }
}
