import AiMarkdownContent from './AiMarkdownContent';

const AttachIcon = () => (
    <svg className="h-3 w-3 shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
    </svg>
);

export default function AiMessageBubble({ message }) {
    const isUser = message.role === 'user';
    const attachments = message.attachments || [];

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-4`}>
            <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    isUser
                        ? 'bg-primary-600 text-white rounded-br-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md'
                }`}
            >
                {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                        {attachments.map((a, i) => (
                            <span
                                key={i}
                                className={`inline-flex items-center gap-1 max-w-[10rem] px-1.5 py-0.5 rounded text-xs ${
                                    isUser ? 'bg-white/20' : 'bg-black/5 dark:bg-white/10'
                                }`}
                                title={a.file_name}
                            >
                                <AttachIcon />
                                <span className="truncate">{a.file_name}</span>
                            </span>
                        ))}
                    </div>
                )}
                {isUser ? (
                    message.content && message.content !== '(attachment only)' && (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                    )
                ) : (
                    <>
                        <AiMarkdownContent content={message.content} />
                        {message.model && !message.isStreaming && (
                            <p className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                                {message.purpose && message.purpose !== 'chat' ? `${message.purpose} · ` : ''}{message.model}
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
