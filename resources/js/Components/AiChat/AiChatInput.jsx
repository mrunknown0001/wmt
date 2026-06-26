import { useState } from 'react';

export default function AiChatInput({ onSend, disabled, messageCount, maxMessages }) {
    const [input, setInput] = useState('');
    const atLimit = messageCount >= maxMessages;

    const handleSend = () => {
        const trimmed = input.trim();
        if (!trimmed || disabled || atLimit) return;
        onSend(trimmed);
        setInput('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="border-t border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                <span>{messageCount}/{maxMessages} messages used</span>
                {atLimit && (
                    <span className="text-amber-600 dark:text-amber-400">Limit reached</span>
                )}
            </div>
            <div className="flex gap-2">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={atLimit ? 'Start a new chat...' : 'Ask about your workload...'}
                    disabled={disabled || atLimit}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 disabled:opacity-50"
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || disabled || atLimit}
                    className="shrink-0 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
