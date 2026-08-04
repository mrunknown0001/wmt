import { useState, useRef, useEffect, useMemo } from 'react';

/**
 * Multi-select for divisions, departments and teams.
 *
 * Picking a division means everybody under it, so its departments and teams are
 * shown ticked and locked rather than left blank — otherwise the list reads as
 * if they had been left out.
 */
export default function OrgUnitFilter({ units, value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef(null);

    const divisions = units?.divisions || [];
    const departments = units?.departments || [];
    const teams = units?.teams || [];

    useEffect(() => {
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const picked = {
        divisions: value?.divisions || [],
        departments: value?.departments || [],
        teams: value?.teams || [],
        all: !!value?.all,
    };

    // Departments and teams that come along with a chosen division, and teams
    // that come along with a chosen department.
    const implied = useMemo(() => {
        const divisionIds = new Set(picked.divisions);
        const impliedDepartments = new Set(
            departments.filter((d) => divisionIds.has(d.division_id)).map((d) => d.id)
        );
        const departmentIds = new Set([...picked.departments, ...impliedDepartments]);
        const impliedTeams = new Set(
            teams.filter((t) => departmentIds.has(t.department_id)).map((t) => t.id)
        );

        return { departments: impliedDepartments, teams: impliedTeams };
    }, [picked.divisions.join(), picked.departments.join(), departments, teams]);

    const toggle = (kind, id) => {
        const current = picked[kind];
        const next = current.includes(id)
            ? current.filter((x) => x !== id)
            : [...current, id];
        // Ticking a single unit is a narrower choice than "everyone", so it
        // takes over rather than sitting underneath it.
        onChange({ ...picked, all: false, [kind]: next });
    };

    const clear = () => onChange({ divisions: [], departments: [], teams: [], all: false });

    // "Everyone" is sent as a flag, not as every unit id — the id list would
    // make for an unwieldy URL in a large organisation.
    const toggleAll = () => onChange({ divisions: [], departments: [], teams: [], all: !picked.all });

    const totalPicked = picked.divisions.length + picked.departments.length + picked.teams.length;

    const matches = (name) => !search || name.toLowerCase().includes(search.toLowerCase());

    const label = useMemo(() => {
        if (picked.all) return 'Everyone';
        if (totalPicked === 0) return 'My tasks';

        const names = [
            ...divisions.filter((d) => picked.divisions.includes(d.id)).map((d) => d.name),
            ...departments.filter((d) => picked.departments.includes(d.id)).map((d) => d.name),
            ...teams.filter((t) => picked.teams.includes(t.id)).map((t) => t.name),
        ];

        return names.length <= 2 ? names.join(', ') : `${names[0]} +${names.length - 1} more`;
    }, [picked.all, totalPicked, picked.divisions.join(), picked.departments.join(), picked.teams.join(), divisions, departments, teams]);

    const nothingToPick = divisions.length === 0 && departments.length === 0 && teams.length === 0;
    if (nothingToPick) return null;

    // A plain function rather than a nested component: declaring a component
    // inside render gives it a new identity every pass, which remounts the
    // whole list and drops keyboard focus mid-click.
    const renderSection = (title, kind, items, impliedIds) => {
        const shown = items.filter((i) => matches(i.name));
        if (shown.length === 0) return null;

        return (
            <div className="py-1" key={kind}>
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {title}
                </p>
                {shown.map((item) => {
                    const checked = picked[kind].includes(item.id);
                    // "Everyone" covers every unit, so the rows read as ticked
                    // and locked for the same reason a chosen division does.
                    const inherited = !checked && (picked.all || impliedIds?.has(item.id));

                    return (
                        <label
                            key={item.id}
                            className={`flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                                inherited
                                    ? 'text-gray-400 dark:text-gray-500 cursor-default'
                                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer'
                            }`}
                        >
                            <input
                                type="checkbox"
                                checked={checked || !!inherited}
                                disabled={!!inherited}
                                onChange={() => toggle(kind, item.id)}
                                className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 disabled:opacity-60"
                            />
                            <span className="truncate">{item.name}</span>
                            {inherited && (
                                <span className="ml-auto text-[10px] uppercase tracking-wide">included</span>
                            )}
                        </label>
                    );
                })}
            </div>
        );
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setIsOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors max-w-[220px]"
            >
                <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="truncate">{label}</span>
                {totalPicked > 0 && (
                    <span className="shrink-0 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 text-[10px] font-semibold px-1.5">
                        {totalPicked}
                    </span>
                )}
                <svg className="h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                    <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search divisions, departments, teams..."
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 px-2.5 py-1.5 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                        />
                    </div>

                    <div className="max-h-72 overflow-y-auto">
                        {units?.canSeeAll && matches('Everyone') && (
                            <label className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700">
                                <input
                                    type="checkbox"
                                    checked={picked.all}
                                    onChange={toggleAll}
                                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                                />
                                <span>Everyone</span>
                            </label>
                        )}
                        {renderSection('Divisions', 'divisions', divisions)}
                        {renderSection('Departments', 'departments', departments, implied.departments)}
                        {renderSection('Teams', 'teams', teams, implied.teams)}
                    </div>

                    <div className="flex items-center justify-end px-3 py-2 border-t border-gray-200 dark:border-gray-700">
                        <button
                            type="button"
                            onClick={clear}
                            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:underline"
                        >
                            Clear (my tasks only)
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
