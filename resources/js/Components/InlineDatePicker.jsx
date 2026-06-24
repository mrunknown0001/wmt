import { useRef } from 'react';
import InlinePopover from './InlinePopover';
import { formatDate } from '../utils';

export default function InlineDatePicker({ currentDate, isOpen, onToggle, onSelect, isOverdue }) {
    const anchorRef = useRef(null);
    const dateValue = currentDate ? currentDate.split('T')[0] : '';

    return (
        <>
            <button
                ref={anchorRef}
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className={`cursor-pointer text-sm ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}
            >
                {formatDate(currentDate) || '—'}
            </button>
            <InlinePopover isOpen={isOpen} onClose={() => onToggle(false)} anchorRef={anchorRef} className="p-3">
                <div className="flex flex-col gap-2">
                    <input
                        type="date"
                        value={dateValue}
                        onChange={(e) => onSelect(e.target.value || null)}
                        className="text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                    />
                    {currentDate && (
                        <button
                            onClick={() => onSelect(null)}
                            className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                        >
                            Clear date
                        </button>
                    )}
                </div>
            </InlinePopover>
        </>
    );
}
