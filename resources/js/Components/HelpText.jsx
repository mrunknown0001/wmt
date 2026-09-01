/**
 * A form's description, or the note under one of its questions.
 *
 * These are written in a rich-text editor now, but plenty were written as plain
 * text before that and are still stored that way. Rendering old plain text as
 * HTML would swallow its line breaks, so each value is shown as what it is: an
 * HTML fragment, or text with its breaks kept.
 *
 * The HTML has already been through RichText::sanitize on the way into the
 * database — this is the display half, and it does not do its own filtering.
 */
const looksLikeHtml = (value) => /<[a-z][\s\S]*>/i.test(value);

export default function HelpText({
    children,
    className = 'mt-1 text-xs text-gray-500 dark:text-gray-400',
}) {
    if (!children) return null;

    return looksLikeHtml(children)
        ? <div className={`${className} rich-text`} dangerouslySetInnerHTML={{ __html: children }} />
        : <p className={`${className} whitespace-pre-line`}>{children}</p>;
}
