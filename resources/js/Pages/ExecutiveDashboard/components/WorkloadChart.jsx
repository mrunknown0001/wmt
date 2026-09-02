import { useEffect, useMemo, useState } from 'react';
import { Link } from '@inertiajs/react';
import Card from '../../../Components/Card';
import Avatar from '../../../Components/Avatar';
import Modal from '../../../Components/Modal';
import { formatDate, formatMinutes, isPastDue } from '../../../utils';

/**
 * Who is carrying how much, and — on a click — what exactly.
 *
 * The bar counts somebody's open tasks. That number invites one question, so
 * each bar opens the list behind it rather than leaving it to be reconstructed
 * from the task pages.
 *
 * Note this is a count of tasks, not of hours: the Workload page measures time
 * from estimates, this measures how many things somebody is holding. The two
 * pages answer different questions and their numbers are not comparable.
 */
const STATUS_LABELS = {
    backlog: 'Backlog',
    to_do: 'To Do',
    in_progress: 'In Progress',
    in_review: 'In Review',
};

const PRIORITY_CLASSES = {
    urgent: 'text-red-600 dark:text-red-400',
    high: 'text-orange-600 dark:text-orange-400',
    medium: 'text-blue-600 dark:text-blue-400',
    low: 'text-gray-500 dark:text-gray-400',
};

export default function WorkloadChart({ data }) {
    const [person, setPerson] = useState(null);
    const [tasks, setTasks] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (!person) return;

        let cancelled = false;
        setLoading(true);
        setError(null);
        setTasks(null);
        setSearch('');

        fetch(`/executive-dashboard/person-tasks?user=${person.id}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
            .then((json) => { if (!cancelled) setTasks(json.tasks); })
            .catch(() => { if (!cancelled) setError('Those tasks could not be loaded.'); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [person]);

    const rows = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!tasks) return [];
        if (!term) return tasks;

        return tasks.filter((t) => t.title.toLowerCase().includes(term)
            || (t.project?.name || '').toLowerCase().includes(term));
    }, [tasks, search]);

    if (!data?.length) {
        return (
            <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Workload Distribution</h3>
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No active tasks</p>
            </Card>
        );
    }

    const maxCount = Math.max(...data.map((d) => d.active_tasks_count), 1);

    const taskHref = (task) => (task.project
        ? `/projects/${task.project.id}/tasks/${task.id}/edit`
        : `/tasks/${task.id}/edit`);

    return (
        <>
            <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Workload Distribution</h3>
                <div className="space-y-2.5">
                    {data.map((user) => (
                        <button
                            key={user.id}
                            type="button"
                            onClick={() => setPerson(user)}
                            className="w-full flex items-center gap-3 rounded-lg px-1 py-0.5 -mx-1 text-left transition-all hover:ring-1 hover:ring-primary-300 dark:hover:ring-primary-600 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 cursor-pointer"
                            title={`Open ${user.name}'s ${user.active_tasks_count} task${user.active_tasks_count === 1 ? '' : 's'}`}
                        >
                            <Avatar name={user.name} size="sm" />
                            <span className="text-sm text-gray-700 dark:text-gray-300 w-28 truncate">{user.name}</span>
                            <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 dark:bg-blue-400 rounded flex items-center px-2 transition-all"
                                    style={{ width: `${Math.max((user.active_tasks_count / maxCount) * 100, 8)}%` }}
                                >
                                    <span className="text-xs font-medium text-white">{user.active_tasks_count}</span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </Card>

            <Modal
                isOpen={person !== null}
                onClose={() => setPerson(null)}
                title={person ? `${person.name} — ${person.active_tasks_count} open task${person.active_tasks_count === 1 ? '' : 's'}` : ''}
                size="2xl"
            >
                {loading && <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>}
                {error && <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}

                {tasks && !loading && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Everything open and assigned, overdue first. Counted regardless of date, the same
                                way the bar is.
                            </p>
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Filter by task or project…"
                                className="shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1 text-xs"
                            />
                        </div>

                        {rows.length === 0 ? (
                            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                {search ? 'Nothing matches that filter.' : 'Nothing open.'}
                            </p>
                        ) : (
                            <div className="max-h-[50vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                        <tr>
                                            <th className="sticky top-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Task</th>
                                            <th className="sticky top-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Project</th>
                                            <th className="sticky top-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                                            <th className="sticky top-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Due</th>
                                            <th className="sticky top-0 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Estimate</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                        {rows.map((task) => (
                                            <tr key={task.id} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors">
                                                <td className="px-3 py-2">
                                                    <Link href={taskHref(task)} className="text-primary-600 dark:text-primary-400 hover:underline">
                                                        {task.title}
                                                    </Link>
                                                    <span className={`ml-2 text-[11px] ${PRIORITY_CLASSES[task.priority] || ''}`}>
                                                        {task.priority}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{task.project?.name || '—'}</td>
                                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{STATUS_LABELS[task.status] || task.status}</td>
                                                <td className={`px-3 py-2 whitespace-nowrap ${
                                                    task.due_date && isPastDue(task.due_date)
                                                        ? 'text-red-600 dark:text-red-400 font-medium'
                                                        : 'text-gray-600 dark:text-gray-300'
                                                }`}>
                                                    {task.due_date ? formatDate(task.due_date) : '—'}
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                                                    {task.estimated_minutes ? formatMinutes(task.estimated_minutes) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </>
    );
}
