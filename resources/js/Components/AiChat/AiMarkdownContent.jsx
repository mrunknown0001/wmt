import ReactMarkdown from 'react-markdown';

export default function AiMarkdownContent({ content }) {
    const cleanContent = (content || '').replace(
        /\|\|\|FOLLOW_UP\|\|\|.*?\|\|\|END_FOLLOW_UP\|\|\|/s,
        ''
    ).trim();

    return (
        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:mt-3 prose-headings:mb-1 prose-table:text-xs">
            <ReactMarkdown>{cleanContent}</ReactMarkdown>
        </div>
    );
}
