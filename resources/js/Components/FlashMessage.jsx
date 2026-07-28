import { useEffect, useState, useCallback } from 'react';
import SuccessCheck from './SuccessCheck';

const types = {
    success: {
        bg: 'bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-700',
        text: 'text-green-800 dark:text-green-300',
        icon: <SuccessCheck className="text-green-500 dark:text-green-400" />,
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
    const [leaving, setLeaving] = useState(false);
    const config = types[type] || types.success;

    const dismiss = useCallback(() => {
        setLeaving(true);
        setTimeout(() => {
            setLeaving(false);
            setVisible(false);
        }, 300);
    }, []);

    useEffect(() => {
        setVisible(true);
        setLeaving(false);
        const timer = setTimeout(dismiss, 4700);
        return () => clearTimeout(timer);
    }, [message, dismiss]);

    if ((!visible && !leaving) || !message) return null;

    return (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${leaving ? 'animate-[slide-out-right_300ms_ease_forwards]' : 'animate-slide-in-right'} ${config.bg}`}>
            {config.icon}
            <span className={`text-sm font-medium ${config.text}`}>{message}</span>
            <button onClick={dismiss} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}
