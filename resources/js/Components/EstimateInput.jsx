import { useState, useEffect } from 'react';
import { formatMinutes, parseMinutes } from '../utils';

/**
 * How long a task is expected to take.
 *
 * Stored as minutes but typed however the person thinks: "1.5", "1:30" and
 * "90m" all mean the same thing. Rejecting two of those spellings just produces
 * wrong numbers in the third.
 */
export default function EstimateInput({ value, onChange, error, disabled = false }) {
    const [text, setText] = useState(value ? formatMinutes(value) : '');
    const [invalid, setInvalid] = useState(false);

    // Follow the form when the value changes elsewhere — a reset, or another
    // field's handler clearing it.
    useEffect(() => {
        setText(value ? formatMinutes(value) : '');
        setInvalid(false);
    }, [value]);

    const commit = () => {
        const trimmed = text.trim();

        if (trimmed === '') {
            setInvalid(false);
            onChange(null);
            return;
        }

        const minutes = parseMinutes(trimmed);

        if (minutes === null || minutes < 0) {
            setInvalid(true);
            return;
        }

        setInvalid(false);
        setText(formatMinutes(minutes));
        onChange(minutes);
    };

    return (
        <div>
            <label htmlFor="estimated_minutes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Estimate <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
                id="estimated_minutes"
                type="text"
                inputMode="decimal"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
                disabled={disabled}
                placeholder="e.g. 2h, 1.5, 90m"
                className="block w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
            />
            {invalid && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                    Enter a duration like 2h, 1.5 or 90m.
                </p>
            )}
            {error && !invalid && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            {!invalid && !error && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Feeds the Workload view. Without it this task shows as unestimated.
                </p>
            )}
        </div>
    );
}
