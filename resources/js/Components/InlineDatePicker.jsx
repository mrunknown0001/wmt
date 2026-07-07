import { useRef, useState, useMemo } from 'react';
import InlinePopover from './InlinePopover';
import { formatDate } from '../utils';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function CalendarGrid({ selectedDate, onSelect }) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const initial = selectedDate ? new Date(selectedDate + 'T00:00:00') : today;
    const [viewYear, setViewYear] = useState(initial.getFullYear());
    const [viewMonth, setViewMonth] = useState(initial.getMonth());

    const weeks = useMemo(() => {
        const first = new Date(viewYear, viewMonth, 1);
        const startDay = first.getDay();
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

        const cells = [];

        // Previous month trailing days
        for (let i = startDay - 1; i >= 0; i--) {
            const d = daysInPrevMonth - i;
            const m = viewMonth === 0 ? 12 : viewMonth;
            const y = viewMonth === 0 ? viewYear - 1 : viewYear;
            cells.push({ day: d, dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, outside: true });
        }

        // Current month days
        for (let d = 1; d <= daysInMonth; d++) {
            cells.push({ day: d, dateStr: `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, outside: false });
        }

        // Next month leading days
        const remaining = 7 - (cells.length % 7);
        if (remaining < 7) {
            for (let d = 1; d <= remaining; d++) {
                const m = viewMonth === 11 ? 1 : viewMonth + 2;
                const y = viewMonth === 11 ? viewYear + 1 : viewYear;
                cells.push({ day: d, dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, outside: true });
            }
        }

        const rows = [];
        for (let i = 0; i < cells.length; i += 7) {
            rows.push(cells.slice(i, i + 7));
        }
        return rows;
    }, [viewYear, viewMonth]);

    const goToPrev = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
        else setViewMonth(viewMonth - 1);
    };

    const goToNext = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
        else setViewMonth(viewMonth + 1);
    };

    const goToToday = () => {
        setViewYear(today.getFullYear());
        setViewMonth(today.getMonth());
    };

    return (
        <div className="w-64">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <button
                    onClick={goToPrev}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <button
                    onClick={goToToday}
                    className="text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                    {MONTHS[viewMonth]} {viewYear}
                </button>
                <button
                    onClick={goToNext}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
                {DAYS.map((d) => (
                    <div key={d} className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 py-1">{d}</div>
                ))}
            </div>

            {/* Date grid */}
            {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7">
                    {week.map((cell) => {
                        const isSelected = selectedDate === cell.dateStr;
                        const isToday = cell.dateStr === todayStr;
                        return (
                            <button
                                key={cell.dateStr}
                                onClick={() => onSelect(cell.dateStr)}
                                className={`h-8 w-8 mx-auto rounded-full text-xs flex items-center justify-center transition-colors
                                    ${cell.outside ? 'text-gray-300 dark:text-gray-600' : 'text-gray-700 dark:text-gray-200'}
                                    ${isSelected ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
                                    ${isToday && !isSelected ? 'ring-1 ring-blue-500 font-semibold' : ''}
                                    ${!isSelected ? 'hover:bg-gray-100 dark:hover:bg-gray-700' : ''}
                                `}
                            >
                                {cell.day}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

export default function InlineDatePicker({ currentDate, isOpen, onToggle, onSelect, isOverdue, onClear, hidden }) {
    const anchorRef = useRef(null);
    const selectedStr = currentDate ? currentDate.split('T')[0] : null;

    const handleSelect = (dateStr) => {
        onSelect(dateStr);
    };

    return (
        <>
            <button
                ref={anchorRef}
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className={`cursor-pointer text-sm rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:ring-1 hover:ring-blue-200 dark:hover:ring-blue-700/60 transition-all ${hidden ? 'sr-only' : ''} ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}
            >
                {formatDate(currentDate) || '—'}
            </button>
            <InlinePopover isOpen={isOpen} onClose={() => onToggle(false)} anchorRef={anchorRef} className="p-3">
                <CalendarGrid selectedDate={selectedStr} onSelect={handleSelect} />
                {(currentDate || onClear) && (
                    <button
                        onClick={() => { if (onClear) { onClear(); } else { onSelect(null); } }}
                        className="mt-2 w-full text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors text-center"
                    >
                        {onClear ? 'Remove start date' : 'Clear date'}
                    </button>
                )}
            </InlinePopover>
        </>
    );
}
