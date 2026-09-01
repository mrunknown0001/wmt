<?php

namespace App\Support;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;

/**
 * Rich text from an editor, made safe to render.
 *
 * The form description and a question's help text are written by whoever builds
 * the form and read by whoever opens its public link — a page no login guards.
 * That is a different proposition from a task description, which only the
 * people already inside the app ever see, so this content is filtered on the
 * way in rather than trusted.
 *
 * An allowlist, not a blocklist: anything not named here is unwrapped or
 * dropped, so a tag or attribute nobody thought of is refused by default.
 */
class RichText
{
    /** What the editor can produce, and nothing else. */
    private const ALLOWED = [
        'p' => [],
        'br' => [],
        'strong' => [],
        'b' => [],
        'em' => [],
        'i' => [],
        'u' => [],
        's' => [],
        'ul' => [],
        'ol' => [],
        'li' => [],
        'a' => ['href', 'target', 'rel'],
        'h2' => [],
        'h3' => [],
        'blockquote' => [],
    ];

    /** Schemes a link may use. javascript: is the reason this list exists. */
    private const SCHEMES = ['http', 'https', 'mailto'];

    public static function sanitize(?string $html): ?string
    {
        if ($html === null || trim($html) === '') {
            return $html;
        }

        // No tags at all: plain text that needs no cleaning, and running it
        // through the parser would only add markup nobody asked for.
        if (! preg_match('/<[a-z!\/]/i', $html)) {
            return $html;
        }

        $doc = new DOMDocument();

        $previous = libxml_use_internal_errors(true);
        // The wrapper keeps DOMDocument from inventing <html><body>, and the
        // encoding hint stops it mangling anything non-ASCII.
        $doc->loadHTML(
            '<?xml encoding="UTF-8"><div id="wmt-root">'.$html.'</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
        );
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $root = $doc->getElementById('wmt-root') ?? $doc->documentElement;

        if (! $root) {
            return strip_tags($html);
        }

        self::clean($root);

        $out = '';
        foreach (iterator_to_array($root->childNodes) as $child) {
            $out .= $doc->saveHTML($child);
        }

        return trim($out);
    }

    /** Walk the tree, unwrapping what is not allowed and stripping what is. */
    private static function clean(DOMNode $node): void
    {
        foreach (iterator_to_array($node->childNodes) as $child) {
            if ($child instanceof DOMElement) {
                $tag = strtolower($child->tagName);

                if (! array_key_exists($tag, self::ALLOWED)) {
                    // script and style carry their payload as text, so they go
                    // entirely; anything else keeps its words and loses its tag.
                    if (in_array($tag, ['script', 'style', 'iframe', 'object', 'embed'], true)) {
                        $child->parentNode->removeChild($child);

                        continue;
                    }

                    self::clean($child);
                    self::unwrap($child);

                    continue;
                }

                self::stripAttributes($child, self::ALLOWED[$tag]);
                self::clean($child);

                continue;
            }

            // Comments can hide markup from a careless reader; text stays.
            if ($child->nodeType === XML_COMMENT_NODE) {
                $child->parentNode->removeChild($child);
            }
        }
    }

    private static function stripAttributes(DOMElement $el, array $keep): void
    {
        foreach (iterator_to_array($el->attributes ?? []) as $attr) {
            if (! in_array(strtolower($attr->name), $keep, true)) {
                $el->removeAttribute($attr->name);

                continue;
            }

            if (strtolower($attr->name) === 'href' && ! self::safeHref($attr->value)) {
                $el->removeAttribute('href');
            }
        }

        // A link out of a public form opens away from it, and rel closes the
        // window.opener hole that comes with target=_blank.
        if (strtolower($el->tagName) === 'a' && $el->hasAttribute('href')) {
            $el->setAttribute('target', '_blank');
            $el->setAttribute('rel', 'noopener noreferrer nofollow');
        }
    }

    private static function safeHref(string $href): bool
    {
        $href = trim($href);

        // Relative links and anchors carry no scheme and are harmless.
        if ($href === '' || str_starts_with($href, '/') || str_starts_with($href, '#')) {
            return true;
        }

        $scheme = strtolower((string) parse_url($href, PHP_URL_SCHEME));

        return in_array($scheme, self::SCHEMES, true);
    }

    /** Replace an element with its children. */
    private static function unwrap(DOMElement $el): void
    {
        $parent = $el->parentNode;

        foreach (iterator_to_array($el->childNodes) as $child) {
            $parent->insertBefore($child, $el);
        }

        $parent->removeChild($el);
    }
}
