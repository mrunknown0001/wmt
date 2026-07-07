import { useState, useRef, useMemo } from 'react';
import InlinePopover from './InlinePopover';
import Avatar from './Avatar';

export default function AssigneePicker({ currentAssignee, users, isOpen, onToggle, onSelect }) {
    const anchorRef = useRef(null);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search) return users.slice(0, 10);
        return users
            .filter((u) => u.name.toLowerCase().includes(search.toLowerCase()))
            .slice(0, 10);
    }, [users, search]);

    const handleSelect = (user) => {
        onSelect(user);
        setSearch('');
    };

    const handleClose = () => {
        onToggle(false);
        setSearch('');
    };

    return (
        <>
            <button
                ref={anchorRef}
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="cursor-pointer flex items-center gap-2 rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:ring-1 hover:ring-blue-200 dark:hover:ring-blue-700/60 transition-all"
            >
                {currentAssignee ? (
                    <>
                        <Avatar name={currentAssignee.name} size="sm" />
                        <span className="text-gray-700 dark:text-gray-300">{currentAssignee.name}</span>
                    </>
                ) : (
                    <span className="text-gray-400">Unassigned</span>
                )}
            </button>
            <InlinePopover isOpen={isOpen} onClose={handleClose} anchorRef={anchorRef} className="w-[240px]">
                <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                    />
                </div>
                <div className="max-h-[200px] overflow-y-auto py-1">
                    <button
                        onClick={() => handleSelect(null)}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        Unassign
                    </button>
                    {filtered.map((user) => (
                        <button
                            key={user.id}
                            onClick={() => handleSelect(user)}
                            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors ${
                                currentAssignee?.id === user.id ? 'bg-gray-50 dark:bg-gray-700/50 font-medium' : 'text-gray-700 dark:text-gray-300'
                            }`}
                        >
                            <Avatar name={user.name} size="sm" />
                            {user.name}
                        </button>
                    ))}
                    {filtered.length === 0 && (
                        <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">No users found</p>
                    )}
                </div>
            </InlinePopover>
        </>
    );
}
