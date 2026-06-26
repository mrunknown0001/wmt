import { useState, useRef, useEffect } from 'react';
import Avatar from './Avatar';

export default function SearchableSelect({ label, id, value, onChange, options = [], placeholder = '— Select —', error, className = '', disabled, showAvatar = false }) {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selectedOption = options.find((o) => String(o.value) === String(value));

    const filtered = options.filter((o) => {
        if (!search) return true;
        return o.label.toLowerCase().includes(search.toLowerCase());
    });

    const handleSelect = (opt) => {
        onChange(opt.value);
        setIsOpen(false);
        setSearch('');
    };

    const handleClear = (e) => {
        e.stopPropagation();
        onChange('');
        setSearch('');
    };

    const handleOpen = () => {
        if (disabled) return;
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    return (
        <div className={className} ref={containerRef}>
            {label && (
                <label htmlFor={id} className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                    {label}
                </label>
            )}
            <div className="relative">
                {/* Trigger button */}
                {!isOpen && (
                    <button
                        type="button"
                        id={id}
                        onClick={handleOpen}
                        disabled={disabled}
                        className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:bg-gray-700 dark:text-gray-100 text-left flex items-center gap-2 ${
                            error ? 'border-red-300 dark:border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-gray-300 dark:border-gray-600'
                        } ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-800' : 'bg-white'}`}
                    >
                        {selectedOption ? (
                            <>
                                {showAvatar && <Avatar name={selectedOption.label} size="sm" />}
                                <span className="truncate flex-1">{selectedOption.label}</span>
                                {!disabled && (
                                    <span onClick={handleClear} className="text-gray-400 hover:text-red-500 shrink-0">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </span>
                                )}
                            </>
                        ) : (
                            <span className="text-gray-400 dark:text-gray-500 truncate flex-1">{placeholder}</span>
                        )}
                        <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                )}

                {/* Search input (shown when open) */}
                {isOpen && (
                    <input
                        ref={inputRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Type to search..."
                        className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 ${
                            error ? 'border-red-300 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
                        } bg-white`}
                    />
                )}

                {/* Dropdown */}
                {isOpen && (
                    <div className="absolute z-30 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {placeholder && (
                            <button
                                type="button"
                                onClick={() => { handleSelect({ value: '' }); }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                                    !value ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                                }`}
                            >
                                {placeholder}
                            </button>
                        )}
                        {filtered.length > 0 ? (
                            filtered.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => handleSelect(opt)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                                        String(opt.value) === String(value) ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : ''
                                    }`}
                                >
                                    {showAvatar && <Avatar name={opt.label} size="sm" />}
                                    <span className="truncate">{opt.label}</span>
                                </button>
                            ))
                        ) : (
                            <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">No results found</div>
                        )}
                    </div>
                )}
            </div>
            {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
}
