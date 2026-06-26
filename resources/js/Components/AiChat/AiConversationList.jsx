export default function AiConversationList({ conversations, onSelect, onDelete, loading }) {
    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
            </div>
        );
    }

    if (!conversations.length) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                <svg className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
                <p className="text-sm text-gray-500 dark:text-gray-400">No conversations yet</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Start a new chat to get AI insights</p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto">
            {conversations.map((conv) => (
                <div
                    key={conv.id}
                    className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer border-b border-gray-100 dark:border-gray-700/50 transition-colors"
                >
                    <div className="flex-1 min-w-0" onClick={() => onSelect(conv.id)}>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {conv.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {conv.user_message_count} messages · {new Date(conv.updated_at).toLocaleDateString()}
                        </p>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                        className="shrink-0 p-1 rounded text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete"
                    >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            ))}
        </div>
    );
}
