import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import Avatar from './Avatar';

export default forwardRef(function MentionList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (event.key === 'ArrowUp') {
                setSelectedIndex((i) => (i + items.length - 1) % items.length);
                return true;
            }
            if (event.key === 'ArrowDown') {
                setSelectedIndex((i) => (i + 1) % items.length);
                return true;
            }
            if (event.key === 'Enter') {
                if (items[selectedIndex]) {
                    command(items[selectedIndex]);
                }
                return true;
            }
            return false;
        },
    }));

    if (!items.length) return null;

    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50">
            <div className="py-1 max-h-48 overflow-y-auto">
                {items.map((item, index) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => command(item)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                            index === selectedIndex
                                ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        <Avatar name={item.label} size="sm" />
                        <span className="truncate">{item.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
});
