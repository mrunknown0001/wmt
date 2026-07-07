import { useState } from 'react';

const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

export default function Tooltip({ children, content, position = 'top', className = '' }) {
    const [visible, setVisible] = useState(false);

    if (!content) return children;

    return (
        <span
            className={`relative inline-flex ${className}`}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            {children}
            {visible && (
                <span className={`absolute ${positions[position]} z-50 px-2.5 py-1 rounded-md bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium whitespace-nowrap shadow-lg pointer-events-none animate-fade-in`}>
                    {content}
                </span>
            )}
        </span>
    );
}
