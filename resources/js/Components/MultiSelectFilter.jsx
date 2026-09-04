import { useState, useRef, useEffect } from 'react';

/**
 * A filter-bar dropdown that searches and selects several options at once.
 *
 * Built for a row of filters rather than a form: it collapses to a single
 * control showing what is chosen ("All teams", one name, or "3 teams"), and
 * opens a searchable checklist. The chips live inside the popover, not the bar,
 * so picking ten teams does not push the date pickers off the screen.
 *
 * `value` is an array of the chosen option values; `onChange` is handed the new
 * array. Nothing is selected means "all", which is why the empty state reads as
 * the plural rather than as a blank.
 */
export default function MultiSelectFilter({ label, noun, options = [], value = [], onChange }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Compared as strings: option values arrive as numbers, the query string
    // hands them back as text, and a mismatched type would silently unselect.
    const chosen = new Set(value.map(String));
    const selectedOptions = options.filter((o) => chosen.has(String(o.value)));

    const filtered = options.filter((o) => !search || o.label.toLowerCase().includes(search.toLowerCase()));

    const toggle = (optValue) => {
        const key = String(optValue);
        const next = chosen.has(key)
            ? value.filter((v) => String(v) !== key)
            : [...value, optValue];
        onChange(next);
    };

    const summary = selectedOptions.length === 0
        ? `All ${noun}`
        : selectedOptions.length === 1
            ? selectedOptions[0].label
            : `${selectedOptions.length} ${noun}`;

    return (
        <div ref={ref} className="relative">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={`flex items-center justify-between gap-2 min-w-40 max-w-56 rounded-lg border px-2 py-1.5 text-sm text-left transition-colors ${
                    selectedOptions.length > 0
                        ? 'border-primary-400 dark:border-primary-500 bg-primary-50/50 dark:bg-primary-900/20 text-gray-900 dark:text-gray-100'
                        : 'border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
            >
                <span className="truncate">{summary}</span>
                <svg className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && (
                <div className="absolute z-40 mt-1 w-64 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                    <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                        <input
                            autoFocus
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={`Search ${noun}…`}
                            className="w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1.5 text-sm placeholder-gray-400"
                        />
                    </div>

                    {selectedOptions.length > 0 && (
                        <button
                            type="button"
                            onClick={() => onChange([])}
                            className="w-full px-3 py-1.5 text-left text-xs text-primary-600 dark:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700"
                        >
                            Clear {selectedOptions.length} selected
                        </button>
                    )}

                    <div className="max-h-56 overflow-y-auto py-1">
                        {filtered.length === 0 ? (
                            <p className="px-3 py-3 text-center text-xs text-gray-400">Nothing matches.</p>
                        ) : filtered.map((o) => {
                            const isChosen = chosen.has(String(o.value));
                            return (
                                <button
                                    key={o.value}
                                    type="button"
                                    onClick={() => toggle(o.value)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                        isChosen
                                            ? 'bg-primary-600 border-primary-600 text-white'
                                            : 'border-gray-300 dark:border-gray-500'
                                    }`}>
                                        {isChosen && (
                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </span>
                                    <span className="truncate">{o.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
