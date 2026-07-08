import { useState, useRef, useCallback } from 'react';

const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

const arrows = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-900 dark:border-t-gray-700 border-x-transparent border-b-transparent border-4',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-900 dark:border-b-gray-700 border-x-transparent border-t-transparent border-4',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-900 dark:border-l-gray-700 border-y-transparent border-r-transparent border-4',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-900 dark:border-r-gray-700 border-y-transparent border-l-transparent border-4',
};

export default function Tooltip({ children, content, position = 'top', className = '', delay = 150 }) {
    const [visible, setVisible] = useState(false);
    const timerRef = useRef(null);

    const show = useCallback(() => {
        timerRef.current = setTimeout(() => setVisible(true), delay);
    }, [delay]);

    const hide = useCallback(() => {
        clearTimeout(timerRef.current);
        setVisible(false);
    }, []);

    if (!content) return children;

    return (
        <span
            className={`relative inline-flex ${className}`}
            onMouseEnter={show}
            onMouseLeave={hide}
        >
            {children}
            {visible && (
                <span className={`absolute ${positions[position]} z-50 px-2.5 py-1 rounded-md bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap shadow-lg pointer-events-none animate-fade-in`}>
                    {content}
                    <span className={`absolute ${arrows[position]} w-0 h-0`} />
                </span>
            )}
        </span>
    );
}
