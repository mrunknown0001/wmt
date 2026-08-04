import { useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Avatar from '../../Components/Avatar';
import Tooltip from '../../Components/Tooltip';
import { formatMinutes } from '../../utils';

/**
 * Load per person per day.
 *
 * Colour is the ratio of committed work to that person's capacity, so a glance
 * down a column shows who is over. Days someone does not work are struck out
 * rather than shown as spare capacity.
 */
const cellClass = (cell) => {
    if (!cell.working) {
        return cell.minutes > 0
            // Work scheduled on a non-working day — worth seeing, not hiding.
            ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
            : 'bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600';
    }

    if (cell.minutes === 0) return 'text-gray-300 dark:text-gray-600';

    const ratio = cell.ratio ?? 0;
    if (ratio > 1) return 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 font-medium';
    if (ratio > 0.85) return 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300';
    return 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300';
};

export default function WorkloadIndex() {
    const { workload, filters, teams = [], departments = [], projects = [], maxDays } = usePage().props;
    const [range, setRange] = useState({ from: filters.from, to: filters.to });

    const go = (params) => router.get('/workload', { ...filters, ...params }, {
        preserveState: true,
        preserveScroll: true,
    });

    const shift = (days) => {
        const from = new Date(`${filters.from}T00:00:00`);
        const to = new Date(`${filters.to}T00:00:00`);
        from.setDate(from.getDate() + days);
        to.setDate(to.getDate() + days);
        const iso = (d) => d.toISOString().slice(0, 10);
        go({ from: iso(from), to: iso(to) });
    };

    const { days, rows } = workload;

    return (
        <AuthenticatedLayout title="Workload">
            <PageHeader
                title="Workload"
                breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Workload' }]}
            />

            <Card>
                <div className="flex flex-wrap items-end gap-3 mb-4">
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

                    <div className="flex gap-1">
                        <button onClick={() => shift(-7)} className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">←</button>
                        <button onClick={() => shift(7)} className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">→</button>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Team</label>
                        <select
                            value={filters.team || ''} onChange={(e) => go({ team: e.target.value || undefined })}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1.5 text-sm"
                        >
                            <option value="">All teams</option>
                            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Department</label>
                        <select
                            value={filters.department || ''} onChange={(e) => go({ department: e.target.value || undefined })}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1.5 text-sm"
                        >
                            <option value="">All departments</option>
                            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Project</label>
                        <select
                            value={filters.project || ''} onChange={(e) => go({ project: e.target.value || undefined })}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1.5 text-sm"
                        >
                            <option value="">All projects</option>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                </div>

                {rows.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
                        Nobody to show for these filters.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-sm">
                            <thead>
                                <tr>
                                    <th className="sticky left-0 z-10 bg-white dark:bg-gray-800 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Person
                                    </th>
                                    {days.map((d) => (
                                        <th key={d.date} className={`px-2 py-2 text-center text-[11px] font-medium whitespace-nowrap ${
                                            d.weekday >= 6 ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'
                                        }`}>
                                            {d.label}
                                        </th>
                                    ))}
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                                        Total
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {rows.map((row) => (
                                    <tr key={row.user.id}>
                                        <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 px-3 py-2 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <Avatar name={row.user.name} size="sm" />
                                                <div className="min-w-0">
                                                    <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{row.user.name}</p>
                                                    <p className="text-[11px] text-gray-400">
                                                        {formatMinutes(row.daily_capacity_minutes)}/day
                                                        {row.unestimated_count > 0 && (
                                                            <Tooltip content={`${row.unestimated_count} assigned task${row.unestimated_count === 1 ? '' : 's'} with no estimate — not counted below`}>
                                                                <span className="ml-1 text-amber-600 dark:text-amber-400 cursor-help">
                                                                    · {row.unestimated_count} unestimated
                                                                </span>
                                                            </Tooltip>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        {row.cells.map((cell) => (
                                            <td key={cell.date} className="px-1 py-1 text-center">
                                                <Tooltip content={
                                                    cell.working
                                                        ? `${formatMinutes(cell.minutes)} of ${formatMinutes(cell.capacity)}`
                                                        : cell.minutes > 0
                                                            ? `${formatMinutes(cell.minutes)} scheduled on a non-working day`
                                                            : 'Not a working day'
                                                }>
                                                    <div className={`rounded px-1.5 py-1 text-[11px] tabular-nums ${cellClass(cell)}`}>
                                                        {cell.minutes > 0 ? formatMinutes(cell.minutes) : '·'}
                                                    </div>
                                                </Tooltip>
                                            </td>
                                        ))}

                                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                                            <span className={row.total_minutes > row.total_capacity ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-gray-300'}>
                                                {formatMinutes(row.total_minutes)}
                                            </span>
                                            <span className="text-gray-400"> / {formatMinutes(row.total_capacity)}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                    A task&rsquo;s estimate is spread evenly across the working days between its start
                    and due dates; with no start date it all lands on the due date. Tasks without an
                    estimate are counted separately and contribute nothing — a light-looking week may
                    just be an unestimated one. Windows are capped at {maxDays} days.
                </p>
            </Card>
        </AuthenticatedLayout>
    );
}
