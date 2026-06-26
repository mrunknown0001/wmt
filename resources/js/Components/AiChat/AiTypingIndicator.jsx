export default function AiTypingIndicator() {
    return (
        <div className="flex items-center gap-1 px-4 py-3">
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-2xl px-4 py-2">
                <span className="h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500 ai-typing-dot" />
                <span className="h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500 ai-typing-dot" />
                <span className="h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500 ai-typing-dot" />
            </div>
        </div>
    );
}
