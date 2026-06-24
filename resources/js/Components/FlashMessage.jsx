import { useEffect, useState } from 'react';

const types = {
    success: {
        bg: 'bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-700',
        text: 'text-green-800 dark:text-green-300',
        icon: (
            <svg className="h-5 w-5 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
    error: {
        bg: 'bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-700',
        text: 'text-red-800 dark:text-red-300',
        icon: (
            <svg className="h-5 w-5 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
};

export default function FlashMessage({ type = 'success', message }) {
    const [visible, setVisible] = useState(true);
    const config = types[type] || types.success;

    useEffect(() => {
        setVisible(true);
        const timer = setTimeout(() => setVisible(false), 5000);
        return () => clearTimeout(timer);
    }, [message]);

    if (!visible || !message) return null;

    return (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg transition-all ${config.bg}`}>
            {config.icon}
            <span className={`text-sm font-medium ${config.text}`}>{message}</span>
            <button onClick={() => setVisible(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}
