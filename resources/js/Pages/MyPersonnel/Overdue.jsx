import { useMemo, useState } from 'react';
import { Link, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Avatar from '../../Components/Avatar';
import EmptyState from '../../Components/EmptyState';
import Tooltip from '../../Components/Tooltip';
import { formatLabel } from '../../utils';

const PRIORITY_PILL = {
    urgent: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    high: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
    medium: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    low: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-700/40 dark:text-gray-300 dark:border-gray-600',
};

/** How alarming a delay should look. */
const lateTone = (days) => {
    if (days > 30) return 'text-red-700 dark:text-red-400 font-semibold';
    if (days > 7) return 'text-red-600 dark:text-red-400';
    return 'text-amber-600 dark:text-amber-400';
};

const fmtDate = (value) => {
    if (!value) return '';
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
};

function Stat({ label, value, tone = '', hint }) {
    return (
        <Card>
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${tone || 'text-gray-900 dark:text-gray-100'}`}>{value}</p>
            {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p>}
        </Card>
    );
}

function TaskRow({ task, showAssignee = true }) {
    return (
        <Link
            href={task.url}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
            <div className="w-28 shrink-0">
                <p className={`text-sm ${lateTone(task.days_late)}`}>
                    {task.days_late} {task.days_late === 1 ? 'day' : 'days'} late
                </p>
                <p className="text-xs text-gray-400">{fmtDate(task.due_date)}</p>
            </div>

            <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{task.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {task.project?.name || 'No project'}
                    <span className="text-gray-300 dark:text-gray-600"> · </span>
                    {formatLabel(task.status)}
                </p>
            </div>

            {showAssignee && task.assignee && (
                <div className="hidden sm:flex items-center gap-2 shrink-0 w-40">
                    <Avatar name={task.assignee.name} size="sm" />
                    <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                        {task.assignee.name}
                    </span>
                </div>
            )}

            <span className={`shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border ${PRIORITY_PILL[task.priority] || PRIORITY_PILL.low}`}>
                {task.priority}
            </span>
        </Link>
    );
}

export default function PersonnelOverdue() {
    const {
        tasks = [], summary = {}, buckets = [], people = [], projects = [],
        limit = 500, capped = false,
    } = usePage().props;

    const [person, setPerson] = useState('');
    const [project, setProject] = useState('');
    const [priority, setPriority] = useState('');
    const [bucket, setBucket] = useState('');
    const [grouped, setGrouped] = useState(true);

    const filtered = useMemo(() => tasks.filter((t) => {
        if (person && String(t.assignee?.id) !== String(person)) return false;
        if (project && String(t.project?.id) !== String(project)) return false;
        if (priority && t.priority !== priority) return false;
        if (bucket && t.bucket !== bucket) return false;
        return true;
    }), [tasks, person, project, priority, bucket]);

    // By person, worst backlog first — who needs help before which task does.
    const byPerson = useMemo(() => {
        const map = new Map();

        filtered.forEach((task) => {
            const key = task.assignee?.id ?? 0;
            if (!map.has(key)) {
                map.set(key, { assignee: task.assignee, tasks: [], worst: 0 });
            }
            const entry = map.get(key);
            entry.tasks.push(task);
            entry.worst = Math.max(entry.worst, task.days_late);
        });

        return [...map.values()].sort((a, b) => b.tasks.length - a.tasks.length || b.worst - a.worst);
    }, [filtered]);

    const hasFilters = person || project || priority || bucket;
    const clear = () => { setPerson(''); setProject(''); setPriority(''); setBucket(''); };

    const select = (value, onChange, placeholder, options) => (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        >
            <option value="">{placeholder}</option>
            {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
    );

    return (
        <AuthenticatedLayout title="Overdue Tasks">
            <PageHeader
                title="Overdue Tasks"
                breadcrumbs={[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'My Personnel', href: '/my-personnel' },
                    { label: 'Overdue' },
                ]}
            />

            {summary.total === 0 ? (
                <EmptyState
                    title="Nothing is overdue"
                    description="Nobody you supervise has a task past its due date. This page fills in when something slips."
                />
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <Stat label="Overdue Tasks" value={summary.total} tone="text-red-600 dark:text-red-400" />
                        <Stat
                            label="People Affected"
                            value={summary.people}
                            hint={summary.people === 1 ? '1 person' : `across ${summary.people} people`}
                        />
                        <Stat label="Projects Affected" value={summary.projects} />
                        <Stat
                            label="Longest Outstanding"
                            value={`${summary.worstDaysLate}d`}
                            tone={lateTone(summary.worstDaysLate)}
                            hint={`${summary.averageDaysLate} days late on average`}
                        />
                    </div>

                    {/* Severity bands double as filters — the usual next question
                        after "how bad is it" is "show me the worst". */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {buckets.map((b) => (
                            <button
                                key={b.key}
                                type="button"
                                onClick={() => setBucket(bucket === b.key ? '' : b.key)}
                                disabled={b.count === 0}
                                className={`px-3 py-1.5 rounded-lg border text-sm transition-colors disabled:opacity-40 disabled:cursor-default ${
                                    bucket === b.key
                                        ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
                                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                }`}
                            >
                                {b.label}
                                <span className="ml-1.5 text-xs tabular-nums opacity-70">{b.count}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        {select(person, setPerson, 'All people',
                            people.map((p) => ({ value: p.id, label: p.name })))}
                        {select(project, setProject, 'All projects',
                            projects.map((p) => ({ value: p.id, label: p.name })))}
                        {select(priority, setPriority, 'All priorities',
                            ['urgent', 'high', 'medium', 'low'].map((p) => ({ value: p, label: formatLabel(p) })))}

                        <button
                            type="button"
                            onClick={() => setGrouped((g) => !g)}
                            className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            {grouped ? 'Show as one list' : 'Group by person'}
                        </button>

                        {hasFilters && (
                            <button
                                type="button"
                                onClick={clear}
                                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                            >
                                Clear
                            </button>
                        )}

                        <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
                            {filtered.length} of {tasks.length} shown
                        </span>
                    </div>

                    {capped && (
                        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                            Showing the {limit} longest-outstanding tasks of {summary.total}. Filter by person
                            or project to narrow it down.
                        </p>
                    )}

                    {filtered.length === 0 ? (
                        <Card>
                            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                                Nothing matches those filters.
                            </p>
                        </Card>
                    ) : grouped ? (
                        <div className="space-y-4">
                            {byPerson.map((entry) => (
                                <Card key={entry.assignee?.id ?? 'unassigned'} padding={false}>
                                    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                                        <Avatar name={entry.assignee?.name || '?'} size="sm" />
                                        <Link
                                            href={entry.assignee ? `/users/${entry.assignee.id}` : '#'}
                                            className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400"
                                        >
                                            {entry.assignee?.name || 'Unassigned'}
                                        </Link>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            {entry.tasks.length} overdue
                                        </span>
                                        <Tooltip content="Longest outstanding task">
                                            <span className={`ml-auto text-xs ${lateTone(entry.worst)}`}>
                                                worst {entry.worst}d
                                            </span>
                                        </Tooltip>
                                    </div>
                                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {entry.tasks.map((task) => (
                                            <TaskRow key={task.id} task={task} showAssignee={false} />
                                        ))}
                                    </div>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <Card padding={false}>
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                {filtered.map((task) => (
                                    <TaskRow key={task.id} task={task} />
                                ))}
                            </div>
                        </Card>
                    )}
                </>
            )}
        </AuthenticatedLayout>
    );
}
