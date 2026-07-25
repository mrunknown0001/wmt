import { useRef, useState } from 'react';

const ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.pdf,.docx,.xls,.xlsx,.csv';
const MAX_FILES = 5;

export default function AiChatInput({ onSend, disabled, messageCount, maxMessages }) {
    const [input, setInput] = useState('');
    const [files, setFiles] = useState([]);
    const fileRef = useRef(null);
    const atLimit = messageCount >= maxMessages;

    const canSend = (input.trim() || files.length > 0) && !disabled && !atLimit;

    const handleSend = () => {
        if (!canSend) return;
        onSend(input.trim(), files);
        setInput('');
        setFiles([]);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const addFiles = (list) => {
        const incoming = Array.from(list);
        setFiles((prev) => [...prev, ...incoming].slice(0, MAX_FILES));
        if (fileRef.current) fileRef.current.value = '';
    };

    const removeFile = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

    return (
        <div className="border-t border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                <span>{messageCount}/{maxMessages} messages used</span>
                {atLimit && <span className="text-amber-600 dark:text-amber-400">Limit reached</span>}
            </div>

            {files.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {files.map((f, i) => (
                        <span key={i} className="inline-flex items-center gap-1 max-w-[12rem] pl-2 pr-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-200">
                            <svg className="h-3 w-3 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            <span className="truncate">{f.name}</span>
                            <button type="button" onClick={() => removeFile(i)} className="shrink-0 px-1 hover:text-red-600" aria-label="Remove">×</button>
                        </span>
                    ))}
                </div>
            )}

            <div className="flex items-end gap-2">
                <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPT}
                    multiple
                    hidden
                    onChange={(e) => addFiles(e.target.files)}
                />
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={disabled || atLimit || files.length >= MAX_FILES}
                    title="Attach image, PDF, Word or Excel file"
                    className="shrink-0 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                </button>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={atLimit ? 'Start a new chat...' : 'Ask, or attach a file to analyze...'}
                    disabled={disabled || atLimit}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 disabled:opacity-50"
                />
                <button
                    onClick={handleSend}
                    disabled={!canSend}
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
