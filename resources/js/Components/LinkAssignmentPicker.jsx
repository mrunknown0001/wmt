import { useMemo, useState } from 'react';

/**
 * Assign a link to any mix of individual users and groups (teams, departments,
 * divisions, roles, custom link groups). Value is an array of {type, id}.
 */

const TYPE_META = {
    user: { label: 'User', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    team: { label: 'Team', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
    department: { label: 'Department', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
    division: { label: 'Division', badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
    role: { label: 'Role', badge: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' },
    group: { label: 'Group', badge: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200' },
};

const keyOf = (a) => `${a.type}:${a.id}`;

export default function LinkAssignmentPicker({
    value = [], onChange, error,
    users = [], teams = [], departments = [], divisions = [], roles = [], linkGroups = [],
}) {
    const [query, setQuery] = useState('');

    // Flatten every assignable thing into one searchable list.
    const catalog = useMemo(() => {
        const rows = [];
        const push = (type, list, countKey) => list.forEach((item) => rows.push({
            type,
            id: item.id,
            name: item.name,
            count: countKey ? item[countKey] : undefined,
        }));
        push('user', users);
        push('team', teams, 'members_count');
        push('department', departments);
        push('division', divisions);
        push('role', roles);
        push('group', linkGroups, 'members_count');
        return rows;
    }, [users, teams, departments, divisions, roles, linkGroups]);

    const selectedKeys = useMemo(() => new Set(value.map(keyOf)), [value]);

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        return catalog
            .filter((row) => !selectedKeys.has(keyOf(row)))
            .filter((row) => !q || row.name?.toLowerCase().includes(q) || TYPE_META[row.type].label.toLowerCase().includes(q))
            .slice(0, 40);
    }, [catalog, selectedKeys, query]);

    const selected = useMemo(
        () => value.map((a) => catalog.find((row) => keyOf(row) === keyOf(a)) ?? { ...a, name: `#${a.id}` }),
        [value, catalog]
    );

    const add = (row) => onChange([...value, { type: row.type, id: row.id }]);
    const remove = (row) => onChange(value.filter((a) => keyOf(a) !== keyOf(row)));

    return (
        <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Assign To
            </label>

            {selected.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {selected.map((row) => (
                        <span
                            key={keyOf(row)}
                            className={`inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full text-xs font-medium ${TYPE_META[row.type]?.badge || ''}`}
                        >
                            <span className="opacity-70">{TYPE_META[row.type]?.label}</span>
                            {row.name}
                            <button
                                type="button"
                                onClick={() => remove(row)}
                                aria-label={`Remove ${row.name}`}
                                className="hover:opacity-70 px-1"
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people, teams, departments, divisions, roles or groups..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
            />

            <div className="mt-2 max-h-56 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                {matches.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {query ? 'Nothing matches that search.' : 'Everything available is already assigned.'}
                    </p>
                ) : (
                    matches.map((row) => (
                        <button
                            key={keyOf(row)}
                            type="button"
                            onClick={() => add(row)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        >
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_META[row.type]?.badge || ''}`}>
                                {TYPE_META[row.type]?.label}
                            </span>
                            <span className="text-gray-900 dark:text-gray-100">{row.name}</span>
                            {typeof row.count === 'number' && (
                                <span className={`ml-auto text-xs ${row.count === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                                    {row.count} member{row.count === 1 ? '' : 's'}
                                </span>
                            )}
                        </button>
                    ))
                )}
            </div>

            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Assigning a group shares the link with everyone in it, including people added later.
            </p>
            {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
}
