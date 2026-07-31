import { Link, router, usePage } from '@inertiajs/react';
import { useState, useCallback, useRef } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Pagination from '../../Components/Pagination';
import { isPastDue } from '../../utils';

const STATUS_OPTIONS = [
    { value: 'backlog', label: 'Backlog' },
    { value: 'to_do', label: 'To Do' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'in_review', label: 'In Review' },
    { value: 'done', label: 'Done' },
    { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTIONS = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' },
];

const DUE_OPTIONS = [
    { value: '', label: 'Any Due Date' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'today', label: 'Due Today' },
];

const statusColor = (s) => ({
    backlog: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    to_do: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    in_review: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
}[s] || 'bg-gray-100 text-gray-700');

const priorityColor = (p) => ({
    low: 'text-gray-500',
    medium: 'text-blue-600 dark:text-blue-400',
    high: 'text-orange-600 dark:text-orange-400',
    urgent: 'text-red-600 dark:text-red-400',
}[p] || 'text-gray-500');

const humanize = (s) => (s || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');
const isOverdue = (t) => !['done', 'cancelled'].includes(t.status) && isPastDue(t.due_date);

export default function Tasks() {
    const { tasks, scopeLabel, filters = {} } = usePage().props;
    const [search, setSearch] = useState(filters.search || '');
    const debounceRef = useRef(null);

    const apply = useCallback((overrides = {}) => {
        const params = {
            scope: filters.scope || undefined,
            scope_id: filters.scope_id || undefined,
            status: overrides.status ?? filters.status,
            due: overrides.due ?? filters.due,
            priority: overrides.priority ?? filters.priority,
            search: overrides.search ?? search,
        };
        Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
        router.get(route('executive-dashboard.tasks'), params, { preserveState: true, preserveScroll: true });
    }, [filters, search]);

    const onSearch = (v) => {
        setSearch(v);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => apply({ search: v }), 300);
    };

    const clear = () => {
        setSearch('');
        const base = {};
        if (filters.scope) base.scope = filters.scope;
        if (filters.scope_id) base.scope_id = filters.scope_id;
        router.get(route('executive-dashboard.tasks'), base, { preserveState: true, preserveScroll: true });
    };

    const hasFilters = filters.status || filters.due || filters.priority || search;
    const selectCls = 'py-1.5 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';

    return (
        <AuthenticatedLayout title="Tasks — Executive Dashboard">
            <PageHeader
                title="Tasks"
                breadcrumbs={[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Executive Dashboard', href: '/executive-dashboard' },
                    { label: 'Tasks' },
                ]}
            />

            <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                    {scopeLabel}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{tasks.total} task{tasks.total === 1 ? '' : 's'}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="relative flex-1 min-w-[14rem] max-w-xs">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => onSearch(e.target.value)}
                        placeholder="Search tasks..."
                        className="w-full pl-3 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                </div>
                <select value={filters.status || ''} onChange={(e) => apply({ status: e.target.value })} className={selectCls}>
                    <option value="">All Statuses</option>
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select value={filters.due || ''} onChange={(e) => apply({ due: e.target.value })} className={selectCls}>
                    {DUE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select value={filters.priority || ''} onChange={(e) => apply({ priority: e.target.value })} className={selectCls}>
                    <option value="">All Priorities</option>
                    {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {hasFilters && (
                    <button onClick={clear} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline">
                        Clear
                    </button>
                )}
            </div>

            <Card padding={false}>
                {tasks.data.length === 0 ? (
                    <p className="p-10 text-center text-gray-500 dark:text-gray-400">
                        No tasks match these filters.
                    </p>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        {['Task', 'Project', 'Assignee', 'Status', 'Priority', 'Due'].map((h) => (
                                            <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {tasks.data.map((task) => (
                                        <tr key={task.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-6 py-4">
                                                {task.project_id ? (
                                                    <Link href={`/projects/${task.project_id}`} className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400">
                                                        {task.title || 'Untitled'}
                                                    </Link>
                                                ) : (
                                                    <span className="font-medium text-gray-900 dark:text-white">{task.title || 'Untitled'}</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{task.project?.name || '—'}</td>
                                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{task.assignee?.name || 'Unassigned'}</td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusColor(task.status)}`}>
                                                    {humanize(task.status)}
                                                </span>
                                            </td>
                                            <td className={`px-6 py-4 text-sm font-medium ${priorityColor(task.priority)}`}>{humanize(task.priority) || '—'}</td>
                                            <td className={`px-6 py-4 text-sm whitespace-nowrap ${isOverdue(task) ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                                                {fmtDate(task.due_date)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination links={tasks.links} />
                    </>
                )}
            </Card>
        </AuthenticatedLayout>
    );
}
