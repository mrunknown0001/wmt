import { useState, useRef, useEffect } from 'react';
import Avatar from './Avatar';

export default function UserMultiSelect({ users, selected = [], onChange, label, excludeIds = [], roles = null, onRoleChange = null }) {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selectedIds = selected.map((s) => (typeof s === 'object' ? s.user_id : s));
    const excluded = new Set([...excludeIds, ...selectedIds]);

    const available = users.filter((u) => {
        if (excluded.has(u.id)) return false;
        if (search && !u.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const selectedUsers = selectedIds.map((id) => users.find((u) => u.id === id)).filter(Boolean);

    const handleAdd = (userId) => {
        if (roles) {
            onChange([...selected, { user_id: userId, role: 'viewer' }]);
        } else {
            onChange([...selectedIds, userId]);
        }
        setSearch('');
    };

    const handleRemove = (userId) => {
        if (roles) {
            onChange(selected.filter((s) => s.user_id !== userId));
        } else {
            onChange(selectedIds.filter((id) => id !== userId));
        }
    };

    const getRoleForUser = (userId) => {
        if (!roles) return null;
        const entry = selected.find((s) => s.user_id === userId);
        return entry?.role || 'viewer';
    };

    return (
        <div ref={containerRef} className="space-y-2">
            {label && (
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
            )}

            {/* Selected users as chips */}
            {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {selectedUsers.map((user) => (
                        <div
                            key={user.id}
                            className="inline-flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 rounded-full pl-1 pr-2 py-1"
                        >
                            <Avatar name={user.name} size="sm" />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{user.name}</span>
                            {roles && (
                                <select
                                    value={getRoleForUser(user.id)}
                                    onChange={(e) => onRoleChange(user.id, e.target.value)}
                                    className="text-xs border-none focus:ring-0 p-0 pl-1 pr-5 cursor-pointer rounded bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-200"
                                >
                                    {roles.map((r) => (
                                        <option key={r} value={r} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                                    ))}
                                </select>
                            )}
                            <button
                                type="button"
                                onClick={() => handleRemove(user.id)}
                                className="text-gray-400 hover:text-red-500 transition-colors ml-0.5"
                            >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Search input */}
            <div className="relative">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => setIsOpen(true)}
                    placeholder="Search users to add..."
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 px-3 py-2 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />

                {/* Dropdown */}
                {isOpen && available.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {available.map((user) => (
                            <button
                                key={user.id}
                                type="button"
                                onClick={() => handleAdd(user.id)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                <Avatar name={user.name} size="sm" />
                                <span>{user.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
