import { useEffect, useMemo, useState } from 'react';
import { Link } from '@inertiajs/react';
import Modal from './Modal';
import { formatMinutes, formatDate } from '../utils';

/**
 * What one number on the Workload grid is made of.
 *
 * The grid says somebody carries 3h on a Tuesday. That is only useful if you
 * can ask which three hours — the answer is a handful of tasks, each
 * contributing the slice of its estimate that fell on that day.
 *
 * The two lists that carry no minutes are the point rather than an appendix: a
 * light-looking day is often a day full of work nobody has estimated, and the
 * grid cannot say so on its own.
 */
const TABS = [
    { key: 'estimated', label: 'Counted' },
    { key: 'unestimated', label: 'No estimate' },
    { key: 'undated', label: 'No dates' },
];

const STATUS_LABELS = {
    backlog: 'Backlog',
    to_do: 'To Do',
    in_progress: 'In Progress',
    in_review: 'In Review',
    done: 'Done',
    cancelled: 'Cancelled',
};

export default function WorkloadBreakdown({ open, onClose, params }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState('estimated');
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (!open || !params) return;

        let cancelled = false;
        setLoading(true);
        setError(null);
        setData(null);
        setTab('estimated');
        setSearch('');

        const query = new URLSearchParams({
            user: params.userId,
            from: params.from,
            to: params.to,
        });
        if (params.date) query.set('date', params.date);
        if (params.project) query.set('project', params.project);

        fetch(`/workload/breakdown?${query}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
            .then((json) => { if (!cancelled) setData(json); })
            .catch(() => { if (!cancelled) setError('That breakdown could not be loaded.'); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [open, params]);

    const lists = {
        estimated: data?.estimated || [],
        unestimated: data?.unestimated || [],
        undated: data?.undated || [],
    };

    const rows = useMemo(() => {
        const term = search.trim().toLowerCase();
        const list = lists[tab] || [];
        if (!term) return list;

        return list.filter((t) => t.title.toLowerCase().includes(term)
            || (t.project?.name || '').toLowerCase().includes(term));
    }, [lists, tab, search]);

    const taskHref = (task) => (task.project
        ? `/projects/${task.project.id}/tasks/${task.id}/edit`
        : `/tasks/${task.id}/edit`);

    // Computed on every render, including the ones where the panel is closed
    // and there is nothing to explain — so it must survive params being null,
    // which is a blank page rather than a blank modal if it does not.
    const heading = !params
        ? ''
        : params.date
            ? `${params.userName} — ${formatDate(params.date)}`
            : `${params.userName} — ${formatDate(params.from)} to ${formatDate(params.to)}`;

    return (
        <Modal isOpen={open} onClose={onClose} title={heading} size="2xl">
            {loading && (
                <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>
            )}

            {error && (
                <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            {data && !loading && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex gap-1">
                            {TABS.map((t) => (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => setTab(t.key)}
                                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                                        tab === t.key
                                            ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {t.label} ({lists[t.key].length})
                                </button>
                            ))}
                        </div>

                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Filter by task or project…"
                            className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1 text-xs"
                        />
                    </div>

                    {tab === 'estimated' && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatMinutes(data.total_minutes)}
                            {params?.date && data.daily_capacity_minutes > 0
                                ? ` of ${formatMinutes(data.daily_capacity_minutes)} for the day`
                                : ' in this window'}
                            {' · an estimate is spread evenly across the working days between a task’s start and due dates.'}
                        </p>
                    )}
                    {tab === 'unestimated' && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Assigned and open, but carrying no estimate — so counted nowhere on the grid.
                        </p>
                    )}
                    {tab === 'undated' && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Estimated, but with no due date to place them on — so counted nowhere on the grid.
                        </p>
                    )}

                    {rows.length === 0 ? (
                        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                            {search ? 'Nothing matches that filter.' : 'Nothing here.'}
                        </p>
                    ) : (
                        <div className="max-h-[50vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <th className="sticky top-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Task</th>
                                        <th className="sticky top-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Project</th>
                                        <th className="sticky top-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Dates</th>
                                        <th className="sticky top-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Estimate</th>
                                        {tab === 'estimated' && (
                                            <th className="sticky top-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Per day</th>
                                        )}
                                        {tab === 'estimated' && (
                                            <th className="sticky top-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                                                {params?.date ? 'This day' : 'In window'}
                                            </th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {rows.map((task) => (
                                        <tr key={task.id} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors">
                                            <td className="px-3 py-2">
                                                <Link href={taskHref(task)} className="text-primary-600 dark:text-primary-400 hover:underline">
                                                    {task.title}
                                                </Link>
                                                <span className="ml-2 text-[11px] text-gray-400">
                                                    {STATUS_LABELS[task.status] || task.status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                                {task.project?.name || '—'}
                                            </td>
                                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                                {task.start_date ? formatDate(task.start_date) : '—'}
                                                {' → '}
                                                {task.due_date ? formatDate(task.due_date) : '—'}
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                                                {task.estimated_minutes ? formatMinutes(task.estimated_minutes) : '—'}
                                            </td>
                                            {tab === 'estimated' && (
                                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-gray-600 dark:text-gray-300">
                                                    {/* Only for work that actually spans days. A task
                                                        living on one day has no rate to speak of — its
                                                        estimate is the day's cost, and printing that
                                                        again as "per day" would invent a distinction. */}
                                                    {task.days_total > 1 ? (
                                                        <>
                                                            <span className="font-medium text-gray-900 dark:text-gray-100">
                                                                {formatMinutes(task.per_day_minutes)}
                                                            </span>
                                                            <span className="text-[11px] text-gray-400"> /day</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-gray-300 dark:text-gray-600">—</span>
                                                    )}
                                                </td>
                                            )}
                                            {tab === 'estimated' && (
                                                <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                                                    {formatMinutes(task.minutes)}
                                                    {task.days_total > 1 && (
                                                        <span className="ml-1 text-[11px] font-normal text-gray-400">
                                                            of {formatMinutes(task.estimated_minutes)} over {task.days_total} days
                                                        </span>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                                {tab === 'estimated' && rows.length > 0 && (
                                    <tfoot>
                                        <tr className="border-t border-gray-200 dark:border-gray-700">
                                            <td colSpan={5} className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                                                Total
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                                                {formatMinutes(rows.reduce((sum, t) => sum + t.minutes, 0))}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
