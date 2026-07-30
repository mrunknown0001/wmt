import { useState, useRef, useEffect, useCallback } from 'react';
import { router } from '@inertiajs/react';
import { apiFetch, formatLabel } from '../utils';
import Avatar from './Avatar';
import StatusBadge from './StatusBadge';

const SearchIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

const ProjectIcon = () => (
    <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
);

const TaskIcon = () => (
    <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
);

const UserIcon = () => (
    <svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

const FolderIcon = () => (
    <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
);

const ApprovalProjectIcon = () => (
    <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
);

const ApprovalItemIcon = () => (
    <svg className="h-4 w-4 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

/**
 * Result sections, rendered in this order. Each entry maps a payload key from
 * /api/search to how a row should look. Adding a searchable type means adding
 * one entry here plus the matching key in SearchController.
 */
const SECTIONS = [
    {
        key: 'projects', label: 'Projects', Icon: ProjectIcon,
        title: (r) => r.name,
        subtitle: (r) => (r.owner ? `Owner: ${r.owner}` : null),
        badge: (r) => <StatusBadge status={r.status} type="project" />,
    },
    {
        key: 'folders', label: 'Folders', Icon: FolderIcon,
        title: (r) => r.name,
        subtitle: (r) => `${r.project_count} ${r.project_count === 1 ? 'project' : 'projects'}`,
    },
    {
        key: 'tasks', label: 'Tasks', Icon: TaskIcon,
        title: (r) => r.title,
        // The number goes in the subtitle rather than the title so it can't
        // push a long task name out of view on a narrow result row.
        subtitle: (r) => [r.series_number, r.project_name].filter(Boolean).join(' · '),
        badge: (r) => <StatusBadge status={r.status} type="task" />,
    },
    {
        key: 'approvalProjects', label: 'Approval Projects', Icon: ApprovalProjectIcon,
        title: (r) => r.name,
        subtitle: (r) => (r.owner ? `Owner: ${r.owner}` : null),
        badge: (r) => <StatusBadge status={r.status} type="project" />,
    },
    {
        key: 'approvalItems', label: 'Items for Approval', Icon: ApprovalItemIcon,
        title: (r) => r.title,
        subtitle: (r) => [r.project_name, r.requester && `by ${r.requester}`, r.archived && 'Archived']
            .filter(Boolean).join(' · '),
        badge: (r) => <StatusBadge status={r.status} type="task" />,
    },
    {
        key: 'users', label: 'Employees', avatar: true,
        title: (r) => r.name,
        subtitle: (r) => r.position || r.email,
    },
];

export default function GlobalSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(null);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const debounceRef = useRef(null);

    // Sections that actually returned rows, in display order. Older payloads (or a
    // cached bundle) may omit newer keys, so default each to an empty list.
    const activeSections = results
        ? SECTIONS.map((s) => ({ ...s, rows: results[s.key] ?? [] })).filter((s) => s.rows.length > 0)
        : [];

    // Flatten results for keyboard navigation, matching the rendered order.
    const flatResults = activeSections.flatMap((s) =>
        s.rows.map((r) => ({ ...r, type: s.key, label: s.title(r), url: r.url }))
    );

    const search = useCallback(async (q) => {
        if (q.length < 2) {
            setResults(null);
            setIsOpen(false);
            return;
        }
        setLoading(true);
        try {
            const res = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            setResults(data);
            setIsOpen(true);
            setActiveIndex(-1);
        } catch {
            setResults(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleChange = (value) => {
        setQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => search(value), 300);
    };

    const navigate = (url) => {
        setIsOpen(false);
        setQuery('');
        setResults(null);
        router.visit(url);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            setIsOpen(false);
            inputRef.current?.blur();
            return;
        }
        if (!isOpen || flatResults.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((prev) => (prev < flatResults.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((prev) => (prev > 0 ? prev - 1 : flatResults.length - 1));
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            navigate(flatResults[activeIndex].url);
        }
    };

    // Click outside to close
    useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Ctrl+K / Cmd+K shortcut
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const hasResults = activeSections.length > 0;
    const noResults = results && !hasResults;

    let flatIndex = -1;

    return (
        <div ref={containerRef} className="relative flex-1 max-w-md">
            <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {loading ? (
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    ) : (
                        <SearchIcon />
                    )}
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => handleChange(e.target.value)}
                    onFocus={() => { if (results) setIsOpen(true); }}
                    onKeyDown={handleKeyDown}
                    placeholder="Search... (Ctrl+K)"
                    className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-gray-50 dark:bg-gray-700"
                />
            </div>

            {isOpen && (hasResults || noResults) && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto animate-slide-down">
                    {noResults && (
                        <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                            No results found for "{query}"
                        </div>
                    )}

                    {activeSections.map((section) => (
                        <div key={section.key}>
                            <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-800/50">
                                {section.label}
                            </div>
                            {section.rows.map((row) => {
                                flatIndex++;
                                const idx = flatIndex;
                                const subtitle = section.subtitle?.(row);
                                return (
                                    <button
                                        key={`${section.key}-${row.id}`}
                                        onClick={() => navigate(row.url)}
                                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                            activeIndex === idx ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                                        }`}
                                    >
                                        {section.avatar
                                            ? <Avatar name={section.title(row)} size="sm" />
                                            : <section.Icon />}
                                        <div className="flex-1 min-w-0 text-left">
                                            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{section.title(row)}</p>
                                            {subtitle && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
                                            )}
                                        </div>
                                        {section.badge?.(row)}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
