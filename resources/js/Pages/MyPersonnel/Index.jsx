import { useMemo, useState } from 'react';
import { Link, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Avatar from '../../Components/Avatar';
import Badge from '../../Components/Badge';
import EmptyState from '../../Components/EmptyState';
import Tooltip from '../../Components/Tooltip';
import { formatLabel } from '../../utils';

const UNIT_STYLE = {
    division: { label: 'Division', pill: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
    department: { label: 'Department', pill: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    team: { label: 'Team', pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
};

/** Everyone in a unit and everything beneath it. */
const countPeople = (unit) =>
    unit.members.length + unit.children.reduce((sum, child) => sum + countPeople(child), 0);

/** Drop members who do not match, then drop units left with nobody. */
const filterUnit = (unit, term) => {
    if (!term) return unit;

    const hit = (m) => [m.name, m.email, m.position, m.role]
        .some((v) => v && String(v).toLowerCase().includes(term));

    const children = unit.children.map((c) => filterUnit(c, term)).filter(Boolean);
    const members = unit.members.filter(hit);

    if (members.length === 0 && children.length === 0) return null;

    return { ...unit, members, children };
};

function PersonRow({ person, cover }) {
    return (
        <Link
            href={`/users/${person.id}`}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
            <Avatar name={person.name} size="sm" />

            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {person.name}
                    {cover && (
                        <Tooltip content={`Covered by ${cover.delegates.join(' & ')} · ${cover.period}`}>
                            <span className="ml-2 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                Away
                            </span>
                        </Tooltip>
                    )}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {person.position || person.email}
                </p>
            </div>

            {person.role && (
                <span className="hidden sm:block">
                    <Badge color="blue">{formatLabel(person.role)}</Badge>
                </span>
            )}

            <div className="flex items-center gap-3 shrink-0 text-xs">
                <Tooltip content="Open tasks">
                    <span className="text-gray-600 dark:text-gray-300 tabular-nums">
                        {person.open_tasks} open
                    </span>
                </Tooltip>
                {person.overdue_tasks > 0 && (
                    <Tooltip content="Overdue tasks">
                        <span className="text-red-600 dark:text-red-400 font-medium tabular-nums">
                            {person.overdue_tasks} overdue
                        </span>
                    </Tooltip>
                )}
            </div>
        </Link>
    );
}

function Unit({ unit, coveredBy, depth = 0 }) {
    const style = UNIT_STYLE[unit.type] || UNIT_STYLE.team;
    const total = countPeople(unit);

    return (
        <div className={depth > 0 ? 'mt-4 pl-3 border-l-2 border-gray-100 dark:border-gray-700' : ''}>
            <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${style.pill}`}>
                    {style.label}
                </span>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{unit.name}</h3>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                    {total} {total === 1 ? 'person' : 'people'}
                </span>
            </div>

            {unit.members.length > 0 && (
                <div className="space-y-0.5">
                    {unit.members.map((person) => (
                        <PersonRow key={person.id} person={person} cover={coveredBy[person.id]} />
                    ))}
                </div>
            )}

            {unit.members.length === 0 && unit.children.length === 0 && (
                <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">
                    Nobody is assigned here yet.
                </p>
            )}

            {unit.children.map((child) => (
                <Unit key={`${child.type}-${child.id}`} unit={child} coveredBy={coveredBy} depth={depth + 1} />
            ))}
        </div>
    );
}

export default function MyPersonnelIndex() {
    const { units = [], coveredBy = {} } = usePage().props;
    const [search, setSearch] = useState('');

    const term = search.trim().toLowerCase();

    const shown = useMemo(
        () => units.map((u) => filterUnit(u, term)).filter(Boolean),
        [units, term]
    );

    const headcount = useMemo(
        () => units.reduce((sum, u) => sum + countPeople(u), 0),
        [units]
    );

    return (
        <AuthenticatedLayout title="My Personnel">
            <PageHeader
                title="My Personnel"
                titleExtra={(
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                        {headcount} {headcount === 1 ? 'person' : 'people'} under your supervision
                    </span>
                )}
                actions={(
                    <Link
                        href="/my-personnel/overdue"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Overdue tasks
                    </Link>
                )}
            />

            {units.length > 0 && (
                <div className="relative max-w-sm mb-4">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search your people..."
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 pl-9 pr-3 py-2 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                </div>
            )}

            {units.length === 0 ? (
                <EmptyState
                    title="Nobody reports to you yet"
                    description="This page lists the people in the division, department or team you head. Once you are set as a head or leader in the org structure, they appear here."
                />
            ) : shown.length === 0 ? (
                <Card>
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                        Nobody matches “{search}”.
                    </p>
                </Card>
            ) : (
                <div className="space-y-6">
                    {shown.map((unit) => (
                        <Card key={`${unit.type}-${unit.id}`}>
                            <Unit unit={unit} coveredBy={coveredBy} />
                        </Card>
                    ))}
                </div>
            )}
        </AuthenticatedLayout>
    );
}
