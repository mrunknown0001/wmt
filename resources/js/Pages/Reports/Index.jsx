import { useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Tooltip from '../../Components/Tooltip';

/** Hours read better as days once they run past a couple of working weeks. */
const duration = (hours) => {
    if (hours === null || hours === undefined) return '—';
    if (hours < 1) return '<1h';
    if (hours < 48) return `${Math.round(hours)}h`;
    return `${(hours / 24).toFixed(1)}d`;
};

/**
 * A headline figure with the sample it came from.
 *
 * The count is deliberately never hidden: "83% on time" across six tasks is not
 * the same claim as across six hundred.
 */
function Stat({ label, value, sub, tone = 'default' }) {
    const tones = {
        default: 'text-gray-900 dark:text-gray-100',
        good: 'text-green-600 dark:text-green-400',
        warn: 'text-amber-600 dark:text-amber-400',
        bad: 'text-red-600 dark:text-red-400',
    };

    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
            {sub && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
        </div>
    );
}

function Bars({ rows, labelKey = 'label', valueKey = 'total' }) {
    const max = Math.max(1, ...rows.map((r) => r[valueKey] || 0));

    return (
        <div className="space-y-1.5">
            {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-xs text-gray-600 dark:text-gray-400 truncate">{r[labelKey]}</span>
                    <div className="flex-1 h-4 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
                        <div className="h-full bg-primary-500/70" style={{ width: `${((r[valueKey] || 0) / max) * 100}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-600 dark:text-gray-400">
                        {r[valueKey] || 0}
                    </span>
                </div>
            ))}
        </div>
    );
}

export default function ReportsIndex() {
    const {
        cycleTime, onTime, throughput = [], approvals, approvers = [], escalations,
        filters, projects = [], approvalProjects = [], people = [], maxDays,
    } = usePage().props;

    const [range, setRange] = useState({ from: filters.from, to: filters.to });

    const go = (params) => router.get('/reports', { ...filters, ...params }, {
        preserveState: true,
        preserveScroll: true,
    });

    const onTimeTone = onTime.rate === null ? 'default'
        : onTime.rate >= 90 ? 'good'
        : onTime.rate >= 70 ? 'warn' : 'bad';

    const select = (label, value, options, onChange, allLabel) => (
        <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
            <select
                value={value || ''}
                onChange={(e) => onChange(e.target.value || undefined)}
                className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1.5 text-sm"
            >
                <option value="">{allLabel}</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
        </div>
    );

    return (
        <AuthenticatedLayout title="Reports">
            <PageHeader
                title="Reports"
                breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Reports' }]}
            />

            <Card>
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">From</label>
                        <input
                            type="date" value={range.from}
                            onChange={(e) => setRange({ ...range, from: e.target.value })}
                            onBlur={() => go({ from: range.from })}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1.5 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
                        <input
                            type="date" value={range.to}
                            onChange={(e) => setRange({ ...range, to: e.target.value })}
                            onBlur={() => go({ to: range.to })}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1.5 text-sm"
                        />
                    </div>
                    {select('Project', filters.project, projects, (v) => go({ project: v }), 'All projects')}
                    {select('Assignee', filters.assignee, people, (v) => go({ assignee: v }), 'Everyone')}
                    {approvalProjects.length > 0 &&
                        select('Approval project', filters.approval_project, approvalProjects, (v) => go({ approval_project: v }), 'All')}
                </div>
                <p className="mt-3 text-xs text-gray-400">Windows are capped at {maxDays} days.</p>
            </Card>

            {/* Tasks */}
            <Card className="mt-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Task delivery</h3>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Stat
                        label="Completed" value={cycleTime.count}
                        sub={cycleTime.partial ? 'sample capped — figures are partial' : 'in this window'}
                    />
                    <Stat
                        label="Median cycle time" value={duration(cycleTime.median_hours)}
                        sub={`mean ${duration(cycleTime.average_hours)} · 90th ${duration(cycleTime.p90_hours)}`}
                    />
                    <Stat
                        label="On time"
                        value={onTime.rate === null ? '—' : `${onTime.rate}%`}
                        sub={onTime.total > 0 ? `${onTime.on_time} of ${onTime.total} with a due date` : 'nothing with a due date'}
                        tone={onTimeTone}
                    />
                    <Stat
                        label="Late" value={onTime.late}
                        sub={onTime.without_due_date > 0 ? `${onTime.without_due_date} had no due date` : 'all dated'}
                        tone={onTime.late > 0 ? 'warn' : 'default'}
                    />
                </div>

                {cycleTime.count > 0 && (
                    <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                How long they took
                            </p>
                            <Bars rows={cycleTime.buckets} />
                        </div>
                        {throughput.length > 0 && (
                            <div>
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                    Completed per week
                                </p>
                                <Bars rows={throughput.map((t) => ({ label: t.week, total: t.total }))} />
                            </div>
                        )}
                    </div>
                )}

                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                    Cycle time runs from when a task was raised to when it was marked done. Tasks with
                    no due date are left out of the on-time figure rather than counted as on time —
                    they cannot be late, and including them would flatter it.
                </p>
            </Card>

            {/* Approvals */}
            <Card className="mt-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Approval turnaround</h3>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Stat label="Steps cleared" value={approvals.count} sub="in this window" />
                    <Stat label="Median" value={duration(approvals.median_hours)} sub={`mean ${duration(approvals.average_hours)}`} />
                    <Stat label="Slowest tenth" value={duration(approvals.p90_hours)} sub="90th percentile" />
                    <Stat
                        label="Still waiting" value={approvals.still_open}
                        sub="open right now"
                        tone={approvals.still_open > 0 ? 'warn' : 'default'}
                    />
                </div>

                {approvals.by_step?.length > 0 && (
                    <div className="mt-5 overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    <th className="px-3 py-2 text-left">Step</th>
                                    <th className="px-3 py-2 text-right">Cleared</th>
                                    <th className="px-3 py-2 text-right">Median</th>
                                    <th className="px-3 py-2 text-right">Approved</th>
                                    <th className="px-3 py-2 text-right">Rejected</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {approvals.by_step.map((s) => (
                                    <tr key={s.name}>
                                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{s.name}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{s.count}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{duration(s.median_hours)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-green-600 dark:text-green-400">{s.approved}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">{s.rejected}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {approvers.length > 0 && (
                    <div className="mt-6">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            Slowest to decide
                            <Tooltip content="Anyone with fewer than three decisions in this window is left out — two slow days is not a pattern.">
                                <span className="ml-1 cursor-help text-gray-400">(3+ decisions)</span>
                            </Tooltip>
                        </p>
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        <th className="px-3 py-2 text-left">Approver</th>
                                        <th className="px-3 py-2 text-right">Decisions</th>
                                        <th className="px-3 py-2 text-right">Average</th>
                                        <th className="px-3 py-2 text-right">Slowest</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {approvers.map((a) => (
                                        <tr key={a.id}>
                                            <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{a.name}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{a.decisions}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{duration(a.average_hours)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-gray-500">{duration(a.slowest_hours)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                    Measured from a step becoming active to it being decided. Steps still open are
                    counted separately rather than averaged in — leaving them out of the average is
                    what stops a stuck approval from looking like a fast one.
                </p>
            </Card>

            {/* Escalations */}
            <Card className="mt-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Escalations</h3>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Stat label="Tasks escalated" value={escalations.total} sub="carrying a level now" />
                    <Stat
                        label="Still open" value={escalations.still_open}
                        tone={escalations.still_open > 0 ? 'bad' : 'good'}
                        sub="escalated and unfinished"
                    />
                </div>

                {escalations.by_project?.length > 0 && (
                    <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">By level</p>
                            <Bars rows={escalations.by_level.map((l) => ({ label: `Level ${l.level}`, total: l.total }))} />
                        </div>
                        <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">By project</p>
                            <Bars rows={escalations.by_project.map((p) => ({ label: p.name, total: p.total }))} />
                        </div>
                    </div>
                )}

                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                    This counts tasks <em>currently</em> carrying an escalation level, not escalations
                    raised during the window — the level is stored on the task, and no history of
                    past escalations is kept. It ignores the date range above.
                </p>
            </Card>
        </AuthenticatedLayout>
    );
}
