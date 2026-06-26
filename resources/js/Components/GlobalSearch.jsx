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

export default function GlobalSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(null);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const debounceRef = useRef(null);

    // Flatten results for keyboard navigation
    const flatResults = results ? [
        ...results.projects.map((r) => ({ ...r, type: 'project', label: r.name, url: r.url })),
        ...results.tasks.map((r) => ({ ...r, type: 'task', label: r.title, url: r.url })),
        ...results.users.map((r) => ({ ...r, type: 'user', label: r.name, url: r.url })),
    ] : [];

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

    const hasResults = results && (results.projects.length > 0 || results.tasks.length > 0 || results.users.length > 0);
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
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                    {noResults && (
                        <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                            No results found for "{query}"
                        </div>
                    )}

                    {results?.projects.length > 0 && (
                        <div>
                            <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-800/50">
                                Projects
                            </div>
                            {results.projects.map((project) => {
                                flatIndex++;
                                const idx = flatIndex;
                                return (
                                    <button
                                        key={`project-${project.id}`}
                                        onClick={() => navigate(project.url)}
                                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                            activeIndex === idx ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                                        }`}
                                    >
                                        <ProjectIcon />
                                        <div className="flex-1 min-w-0 text-left">
                                            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{project.name}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{project.owner && `Owner: ${project.owner}`}</p>
                                        </div>
                                        <StatusBadge status={project.status} type="project" />
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {results?.tasks.length > 0 && (
                        <div>
                            <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-800/50">
                                Tasks
                            </div>
                            {results.tasks.map((task) => {
                                flatIndex++;
                                const idx = flatIndex;
                                return (
                                    <button
                                        key={`task-${task.id}`}
                                        onClick={() => navigate(task.url)}
                                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                            activeIndex === idx ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                                        }`}
                                    >
                                        <TaskIcon />
                                        <div className="flex-1 min-w-0 text-left">
                                            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{task.project_name}</p>
                                        </div>
                                        <StatusBadge status={task.status} type="task" />
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {results?.users.length > 0 && (
                        <div>
                            <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase bg-gray-50 dark:bg-gray-800/50">
                                Users
                            </div>
                            {results.users.map((user) => {
                                flatIndex++;
                                const idx = flatIndex;
                                return (
                                    <button
                                        key={`user-${user.id}`}
                                        onClick={() => navigate(user.url)}
                                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                            activeIndex === idx ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                                        }`}
                                    >
                                        <Avatar name={user.name} size="sm" />
                                        <div className="flex-1 min-w-0 text-left">
                                            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{user.name}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{user.position || user.email}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
