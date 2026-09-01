/**
 * Text that may or may not carry markup.
 *
 * Form descriptions, question help text and approval comments were all plain
 * text before they had an editor, and plenty of each still is. Rendering old
 * plain text as HTML would swallow its line breaks, so each value is shown as
 * what it is: an HTML fragment, or text with its breaks kept.
 *
 * Anything rendered here has already been through RichText::sanitize on the way
 * into the database — this is the display half, and it does no filtering of
 * its own.
 */
const looksLikeHtml = (value) => /<[a-z][\s\S]*>/i.test(value);

export default function RichContent({ children, className = '', breaks = 'whitespace-pre-line' }) {
    if (!children) return null;

    return looksLikeHtml(children)
        ? <div className={`${className} rich-text`} dangerouslySetInnerHTML={{ __html: children }} />
        : <p className={`${className} ${breaks}`}>{children}</p>;
}
