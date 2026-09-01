import RichContent from './RichContent';

/**
 * A form's description, or the note under one of its questions.
 *
 * The same renderer as any other stored rich text, with the styling these two
 * places share so each call site does not repeat it.
 */
export default function HelpText({ children, className = 'mt-1 text-xs text-gray-500 dark:text-gray-400' }) {
    return <RichContent className={className}>{children}</RichContent>;
}
