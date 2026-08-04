import { useMemo, useState } from 'react';
import { Link, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Avatar from '../../Components/Avatar';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

// Activity tier from the last-30-days action count.
const activityTier = (n) => {
    if (n >= 20) return { label: 'Very Active', cls: 'text-green-600 dark:text-green-400', dot: 'bg-green-500' };
    if (n >= 8) return { label: 'Active', cls: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' };
    if (n >= 1) return { label: 'Low Activity', cls: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' };
    return { label: 'Inactive', cls: 'text-gray-500 dark:text-gray-400', dot: 'bg-gray-400' };
};

const rateColor = (r) => (r >= 75 ? 'text-green-600 dark:text-green-400' : r >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400');
const barColor = (r) => (r >= 75 ? 'bg-green-500' : r >= 40 ? 'bg-amber-500' : 'bg-red-500');

// Small info affordance with a hover tooltip.
function InfoTip({ text }) {
    return (
        <span className="group relative inline-flex align-middle">
            <svg className="h-3.5 w-3.5 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
            </svg>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 z-20 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-normal leading-relaxed px-3 py-2 shadow-lg text-left normal-case">
                {text}
            </span>
        </span>
    );
}

const PRODUCTIVITY_TIP = 'Weighted score: 50% Completion Rate + 30% On-Time Rate + 20% Activity. Activity is this user’s actions over the last 30 days, counting up to 20 (each action = 5 points, capped at 100).';

function Meter({ label, value, suffix = '%', tip }) {
    return (
        <div>
            <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm text-gray-600 dark:text-gray-400 inline-flex items-center gap-1">
                    {label}{tip && <InfoTip text={tip} />}
                </span>
                <span className={`text-sm font-semibold ${rateColor(value)}`}>{value}{suffix}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div className={`h-full rounded-full ${barColor(value)}`} style={{ width: `${Math.min(100, value)}%` }} />
            </div>
        </div>
    );
}

function Stat({ label, value, accent = '', tip }) {
    return (
        <Card>
            <p className={`text-3xl font-bold ${accent || 'text-gray-900 dark:text-gray-100'}`}>{value}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 inline-flex items-center gap-1">
                {label}{tip && <InfoTip text={tip} />}
            </p>
        </Card>
    );
}

const PRIORITY_PILL = {
    urgent: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    high: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
    medium: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    low: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-700/40 dark:text-gray-300 dark:border-gray-600',
};

/** "Today", "Tomorrow", or "Tue 12 Aug". */
function dueLabel(value) {
    if (!value) return '';

    const [y, m, d] = value.split('-').map(Number);
    const due = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((due - today) / 86400000);

    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';

    return due.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "14:00" from a stored time of any precision. */
const timeLabel = (value) => (value ? String(value).slice(0, 5) : null);

function UpcomingTasks({ upcoming, name }) {
    const {
        tasks = [], overdue = [],
        weekCount = 0, monthCount = 0, overdueCount = 0, limit = 50,
    } = upcoming || {};

    // Overdue work is what needs attention, so the card opens on it when there
    // is any. Otherwise it opens on the week ahead.
    const [range, setRange] = useState(overdueCount > 0 ? 'overdue' : 'week');

    const shown = useMemo(() => {
        if (range === 'overdue') return overdue;
        return tasks.filter((t) => (range === 'week' ? t.in_week : t.in_month));
    }, [tasks, overdue, range]);

    const total = { overdue: overdueCount, week: weekCount, month: monthCount }[range];
    // The list is capped, so say so rather than quietly showing fewer than the
    // count on the tab claims.
    const hidden = Math.max(0, total - shown.length);

    const emptyMessage = {
        overdue: 'Nothing overdue.',
        week: `Nothing due for ${name.split(' ')[0]} for the rest of this week.`,
        month: `Nothing due for ${name.split(' ')[0]} for the rest of this month.`,
    }[range];

    const tab = (key, label, count, danger = false) => (
        <button
            type="button"
            onClick={() => setRange(key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                range === key
                    ? danger
                        ? 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                    : danger && count > 0
                        ? 'text-red-600 hover:text-red-700 dark:text-red-400'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
        >
            {label}
            <span className="ml-1.5 text-xs tabular-nums opacity-70">{count}</span>
        </button>
    );

    return (
        <Card className="mb-6" padding={false}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Tasks</h3>
                <div className="flex items-center gap-1">
                    {tab('overdue', 'Overdue', overdueCount, true)}
                    {tab('week', 'This week', weekCount)}
                    {tab('month', 'This month', monthCount)}
                </div>
            </div>

            {shown.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                    {emptyMessage}
                </p>
            ) : (
                <>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-96 overflow-y-auto">
                        {shown.map((task) => (
                            <li key={task.id}>
                                <Link
                                    href={task.url}
                                    className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                >
                                    <div className="w-24 shrink-0">
                                        <p className={`text-xs font-medium ${
                                            task.days_late != null
                                                ? 'text-red-600 dark:text-red-400'
                                                : 'text-gray-900 dark:text-gray-100'
                                        }`}>
                                            {dueLabel(task.due_date)}
                                        </p>
                                        {task.days_late != null ? (
                                            <p className="text-xs text-red-500 dark:text-red-400">
                                                {task.days_late} {task.days_late === 1 ? 'day' : 'days'} late
                                            </p>
                                        ) : timeLabel(task.due_time) && (
                                            <p className="text-xs text-gray-400">{timeLabel(task.due_time)}</p>
                                        )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{task.title}</p>
                                        {task.project && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                {task.project.name}
                                            </p>
                                        )}
                                    </div>

                                    <span className={`shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border ${PRIORITY_PILL[task.priority] || PRIORITY_PILL.low}`}>
                                        {task.priority}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                    {hidden > 0 && (
                        <p className="px-6 py-2.5 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
                            Showing the first {limit} — {hidden} more due in this period.
                        </p>
                    )}
                </>
            )}
        </Card>
    );
}

export default function Show() {
    const { profile, kpis, recentActivity = [], upcoming, canManage } = usePage().props;
    const tier = activityTier(kpis.activity30);

    return (
        <AuthenticatedLayout title={`${profile.name} — Overview`}>
            <PageHeader
                title="User Overview"
                breadcrumbs={[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Users', href: '/users' },
                    { label: profile.name },
                ]}
                actions={canManage && <Link href={`/users/${profile.id}/edit`} className="px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">Edit User</Link>}
            />

            {/* Identity */}
            <Card className="mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    <Avatar name={profile.name} size="lg" />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{profile.name}</h2>
                            {!profile.is_active && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Inactive</span>
                            )}
                            {profile.roles?.map((r) => (
                                <span key={r} className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">{r}</span>
                            ))}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{profile.position || '—'} · {profile.email}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {[profile.division, profile.department, profile.team].filter(Boolean).join(' › ') || 'No org unit'}
                        </p>
                    </div>
                    <div className="text-right">
                        <div className={`inline-flex items-center gap-2 text-sm font-medium ${tier.cls}`}>
                            <span className={`w-2 h-2 rounded-full ${tier.dot}`} />
                            {tier.label}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Last active {fmtDate(kpis.lastActivityAt)}</p>
                    </div>
                </div>
            </Card>

            {/* Headline KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Stat label="Productivity" value={`${kpis.productivity}%`} accent={rateColor(kpis.productivity)} tip={PRODUCTIVITY_TIP} />
                <Stat label="Projects Involved" value={kpis.projectsInvolved} />
                <Stat label="Tasks Completed" value={kpis.tasksCompleted} accent="text-green-600 dark:text-green-400" />
                <Stat label="Overdue Tasks" value={kpis.tasksOverdue} accent={kpis.tasksOverdue > 0 ? 'text-red-600 dark:text-red-400' : ''} />
            </div>

            <UpcomingTasks upcoming={upcoming} name={profile.name} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Performance meters */}
                <Card className="lg:col-span-1">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Performance</h3>
                    <div className="space-y-4">
                        <Meter label="Completion Rate" value={kpis.completionRate} tip="Tasks marked Done ÷ total tasks assigned." />
                        <Meter label="On-Time Rate" value={kpis.onTimeRate} tip="Completed tasks finished on or before their due date ÷ completed tasks that had a due date." />
                        <Meter label="Productivity Score" value={kpis.productivity} tip={PRODUCTIVITY_TIP} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-gray-100 dark:border-gray-700 text-center">
                        <div>
                            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{kpis.tasksTotal}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Total Tasks</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{kpis.tasksActive}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Active Tasks</p>
                        </div>
                    </div>
                </Card>

                {/* Projects */}
                <Card className="lg:col-span-1">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Projects</h3>
                    <div className="space-y-3">
                        {[
                            { label: 'Owned', value: kpis.projectsOwned },
                            { label: 'Member of', value: kpis.projectsMember },
                            { label: 'Total Involved', value: kpis.projectsInvolved },
                        ].map((row) => (
                            <div key={row.label} className="flex items-center justify-between">
                                <span className="text-sm text-gray-600 dark:text-gray-400">{row.label}</span>
                                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{row.value}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Actions in last 30 days</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">{kpis.activity30}</p>
                    </div>
                </Card>

                {/* Recent activity */}
                <Card className="lg:col-span-1" padding={false}>
                    <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
                    </div>
                    {recentActivity.length === 0 ? (
                        <p className="px-6 py-8 text-center text-sm text-gray-400 dark:text-gray-500">No recent activity.</p>
                    ) : (
                        <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-80 overflow-y-auto">
                            {recentActivity.map((a, i) => (
                                <li key={i} className="px-6 py-3">
                                    <p className="text-sm text-gray-800 dark:text-gray-200">
                                        <span className="font-medium">{a.action}</span>
                                        {a.entity && <span className="text-gray-500 dark:text-gray-400"> · {a.entity}</span>}
                                    </p>
                                    {a.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{a.description}</p>}
                                    <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(a.created_at)}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
