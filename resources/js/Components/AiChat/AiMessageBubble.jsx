import AiMarkdownContent from './AiMarkdownContent';

export default function AiMessageBubble({ message }) {
    const isUser = message.role === 'user';

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-4`}>
            <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    isUser
                        ? 'bg-primary-600 text-white rounded-br-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md'
                }`}
            >
                {isUser ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                ) : (
                    <AiMarkdownContent content={message.content} />
                )}
            </div>
        </div>
    );
}
