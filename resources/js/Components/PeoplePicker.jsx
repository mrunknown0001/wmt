import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils';
import Avatar from './Avatar';

/**
 * Multi-select picker for the "People" custom field.
 *
 * Scoping lives on the field definition, not here: an admin picks a division,
 * department and/or team when creating the field, and this picker only ever
 * lists the people inside that scope. Without a scope every active user is
 * listed. Either way the person filling in the field gets a ready-made list
 * rather than having to narrow it down themselves.
 *
 * `value` is an array of user ids; `onChange` receives the same.
 */

// The directory is the same for every picker on a page, so fetch it once and
// share the promise across mounted instances.
let optionsPromise = null;
const loadOptions = () => {
    if (!optionsPromise) {
        optionsPromise = apiFetch('/api/people-options')
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
            .catch((e) => {
                optionsPromise = null; // allow a retry on the next mount
                throw e;
            });
    }
    return optionsPromise;
};

/** Shared so the field editor can build its scope dropdowns from the same fetch. */
export const loadPeopleOptions = loadOptions;

/** True when a field config actually narrows anything. */
export const hasPeopleScope = (config) =>
    !!(config && (config.division_id || config.department_id || config.team_id));

export default function PeoplePicker({ value = [], onChange, disabled = false, scope = null }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(false);
    const [search, setSearch] = useState('');
    const [divisionId, setDivisionId] = useState('');
    const [departmentId, setDepartmentId] = useState('');
    const [teamId, setTeamId] = useState('');

    // A configured scope replaces the interactive filters entirely.
    const scoped = hasPeopleScope(scope);
    const effDivision = scoped ? (scope.division_id ? String(scope.division_id) : '') : divisionId;
    const effDepartment = scoped ? (scope.department_id ? String(scope.department_id) : '') : departmentId;
    const effTeam = scoped ? (scope.team_id ? String(scope.team_id) : '') : teamId;

    useEffect(() => {
        let alive = true;
        loadOptions()
            .then((d) => alive && setData(d))
            .catch(() => alive && setError(true));
        return () => { alive = false; };
    }, []);

    const selected = useMemo(
        () => new Set((value || []).map(Number)),
        [value]
    );

    // Department and team dropdowns follow the broader filter above them.
    const departments = useMemo(() => {
        if (!data) return [];
        return divisionId
            ? data.departments.filter((d) => String(d.division_id) === String(divisionId))
            : data.departments;
    }, [data, divisionId]);

    const teams = useMemo(() => {
        if (!data) return [];
        const deptIds = departmentId
            ? [String(departmentId)]
            : departments.map((d) => String(d.id));
        return data.teams.filter((t) => deptIds.includes(String(t.department_id)));
    }, [data, departmentId, departments]);

    const visibleUsers = useMemo(() => {
        if (!data) return [];
        const q = search.trim().toLowerCase();
        return data.users.filter((u) => {
            if (effDivision && String(u.division_id) !== String(effDivision)) return false;
            if (effDepartment && String(u.department_id) !== String(effDepartment)) return false;
            if (effTeam && String(u.team_id) !== String(effTeam)) return false;
            if (q && !`${u.name} ${u.position || ''}`.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [data, search, effDivision, effDepartment, effTeam]);

    /** Human-readable description of a configured scope, e.g. "Finance · Payroll". */
    const scopeLabel = useMemo(() => {
        if (!scoped || !data) return null;
        const parts = [
            data.divisions.find((d) => String(d.id) === effDivision)?.name,
            data.departments.find((d) => String(d.id) === effDepartment)?.name,
            data.teams.find((t) => String(t.id) === effTeam)?.name,
        ].filter(Boolean);
        return parts.length ? parts.join(' · ') : null;
    }, [scoped, data, effDivision, effDepartment, effTeam]);

    const selectedUsers = useMemo(
        () => (data ? data.users.filter((u) => selected.has(u.id)) : []),
        [data, selected]
    );

    const toggle = (id) => {
        if (disabled) return;
        const next = new Set(selected);
        next.has(id) ? next.delete(id) : next.add(id);
        onChange([...next]);
    };

    const clearFilters = () => { setDivisionId(''); setDepartmentId(''); setTeamId(''); setSearch(''); };
    const hasFilters = divisionId || departmentId || teamId || search;

    if (error) {
        return <p className="text-sm text-red-600 dark:text-red-400">Could not load the people list.</p>;
    }
    if (!data) {
        return <p className="text-sm text-gray-500 dark:text-gray-400">Loading people…</p>;
    }

    const selectCls = 'px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200';

    return (
        <div className="space-y-2">
            {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selectedUsers.map((u) => (
                        <span key={u.id} className="inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-full text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
                            <Avatar name={u.name} size="sm" />
                            {u.name}
                            {!disabled && (
                                <button type="button" onClick={() => toggle(u.id)} aria-label={`Remove ${u.name}`} className="px-0.5 hover:opacity-70">×</button>
                            )}
                        </span>
                    ))}
                </div>
            )}

            {/* When the field carries a scope the list is already narrowed, so the
                filter row would be misleading — show what it is limited to instead. */}
            {scoped ? (
                scopeLabel && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Limited to <span className="font-medium text-gray-700 dark:text-gray-300">{scopeLabel}</span>
                    </p>
                )
            ) : (
                <div className="flex flex-wrap gap-1.5">
                    <select value={divisionId} onChange={(e) => { setDivisionId(e.target.value); setDepartmentId(''); setTeamId(''); }} className={selectCls} disabled={disabled}>
                        <option value="">All divisions</option>
                        {data.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setTeamId(''); }} className={selectCls} disabled={disabled}>
                        <option value="">All departments</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={selectCls} disabled={disabled}>
                        <option value="">All teams</option>
                        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    {hasFilters && (
                        <button type="button" onClick={clearFilters} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Clear</button>
                    )}
                </div>
            )}

            <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people..."
                disabled={disabled}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            />

            <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 scrollbar-thin">
                {visibleUsers.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">No people match these filters.</p>
                ) : (
                    visibleUsers.map((u) => (
                        <label key={u.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                            <input
                                type="checkbox"
                                checked={selected.has(u.id)}
                                onChange={() => toggle(u.id)}
                                disabled={disabled}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600"
                            />
                            <Avatar name={u.name} size="sm" />
                            <span className="text-gray-900 dark:text-gray-100">{u.name}</span>
                            {u.position && <span className="text-xs text-gray-500 dark:text-gray-400 truncate">· {u.position}</span>}
                        </label>
                    ))
                )}
            </div>
        </div>
    );
}
