import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, router, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import PriorityBadge from '../../Components/PriorityBadge';
import StatusBadge from '../../Components/StatusBadge';
import EmptyState from '../../Components/EmptyState';
import { formatDate, formatLabel, taskEditUrl } from '../../utils';

const TASK_STATUSES = ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const sections = [
    { key: 'overdue', label: 'Overdue', color: 'red' },
    { key: 'dueToday', label: 'Due Today', color: 'yellow' },
    { key: 'upcoming', label: 'Upcoming (Next 7 Days)', color: 'blue' },
    { key: 'later', label: 'Later', color: 'gray' },
    { key: 'noDueDate', label: 'No Due Date', color: 'gray' },
];

const sectionStyles = {
    red: {
        header: 'text-red-700 dark:text-red-400',
        badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
        row: 'border-l-red-500',
    },
    yellow: {
        header: 'text-yellow-700 dark:text-yellow-400',
        badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
        row: 'border-l-yellow-500',
    },
    blue: {
        header: 'text-blue-700 dark:text-blue-400',
        badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
        row: 'border-l-blue-500',
    },
    gray: {
        header: 'text-gray-700 dark:text-gray-400',
        badge: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-400',
        row: 'border-l-gray-400',
    },
};

function TaskSection({ section, tasks }) {
    if (!tasks || tasks.length === 0) return null;

    const style = sectionStyles[section.color];

    return (
        <div className="mb-6 last:mb-0">
            <div className="flex items-center gap-2 mb-3 px-1">
                <h3 className={`text-sm font-semibold ${style.header}`}>{section.label}</h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.badge}`}>
                    {tasks.length}
                </span>
            </div>
            <Card padding={false}>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {tasks.map((task) => (
                        <Link
                            key={task.id}
                            href={taskEditUrl(task)}
                            className={`flex items-center gap-4 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-l-3 ${style.row}`}
                        >
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                    {task.title}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {task.project?.name || 'Personal'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <PriorityBadge priority={task.priority} />
                                <StatusBadge status={task.status} type="task" />
                                {(task.start_date || task.due_date) && (
                                    <span className={`text-xs whitespace-nowrap ${
                                        section.key === 'overdue' ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'
                                    }`}>
                                        {task.start_date && task.due_date ? `${formatDate(task.start_date)} → ${formatDate(task.due_date)}` : formatDate(task.due_date) || formatDate(task.start_date)}
                                    </span>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            </Card>
        </div>
    );
}

function QuickAddTask({ canAssignOthers, users, projects, priorities }) {
    const [expanded, setExpanded] = useState(false);
    const inputRef = useRef(null);
    const { data, setData, post, processing, reset, errors } = useForm({
        title: '',
        status: 'to_do',
        priority: 'medium',
        assigned_to: '',
        project_id: '',
        due_date: '',
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!data.title.trim()) return;

        post('/tasks', {
            preserveScroll: true,
            onSuccess: () => {
                reset();
                setExpanded(false);
            },
        });
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !expanded) {
            handleSubmit(e);
        }
        if (e.key === 'Escape') {
            reset();
            setExpanded(false);
        }
    };

    return (
        <Card padding={false}>
            <form onSubmit={handleSubmit}>
                <div className="flex items-center gap-3 px-5 py-3">
                    <svg className="h-5 w-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        value={data.title}
                        onChange={(e) => setData('title', e.target.value)}
                        onFocus={() => setExpanded(true)}
                        onKeyDown={handleKeyDown}
                        placeholder="Add a task..."
                        className="flex-1 text-sm bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-0 p-0"
                    />
                    {data.title.trim() && (
                        <button
                            type="submit"
                            disabled={processing}
                            className="text-xs font-medium px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                            Add
                        </button>
                    )}
                    {expanded && (
                        <button
                            type="button"
                            onClick={() => { reset(); setExpanded(false); }}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
                {expanded && (
                    <div className="px-5 pb-3 flex flex-wrap items-center gap-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                        <select
                            value={data.priority}
                            onChange={(e) => setData('priority', e.target.value)}
                            className="text-xs rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-gray-200 dark:bg-gray-700"
                        >
                            {priorities.map((p) => (
                                <option key={p} value={p}>{formatLabel(p)}</option>
                            ))}
                        </select>
                        <input
                            type="date"
                            value={data.due_date}
                            onChange={(e) => setData('due_date', e.target.value)}
                            className="text-xs rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-gray-200 dark:bg-gray-700"
                        />
                        {canAssignOthers && (
                            <select
                                value={data.assigned_to}
                                onChange={(e) => setData('assigned_to', e.target.value)}
                                className="text-xs rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-gray-200 dark:bg-gray-700"
                            >
                                <option value="">Assign to me</option>
                                {users.map((u) => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                        )}
                        <select
                            value={data.project_id}
                            onChange={(e) => setData('project_id', e.target.value)}
                            className="text-xs rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-700 dark:text-gray-200 dark:bg-gray-700"
                        >
                            <option value="">No project</option>
                            {projects.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                )}
                {errors.title && (
                    <p className="px-5 pb-2 text-xs text-red-500">{errors.title}</p>
                )}
            </form>
        </Card>
    );
}

export default function Index({ allTasks, taskGroups: defaultGroups, stats: defaultStats, canAssignOthers = false, users = [], projects = [], statuses = TASK_STATUSES, priorities = PRIORITIES }) {
    const [filterSearch, setFilterSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterPriority, setFilterPriority] = useState('');

    // Reload task list when task-related notifications arrive
    useEffect(() => {
        const handler = (e) => {
            const type = e.detail?.type;
            if (['task_assigned', 'task_due_soon', 'task_overdue'].includes(type)) {
                router.reload({ preserveScroll: true });
            }
        };
        window.addEventListener('wmt:notification', handler);
        return () => window.removeEventListener('wmt:notification', handler);
    }, []);

    const hasActiveFilters = filterSearch || filterStatus || filterPriority;

    const { taskGroups, stats } = useMemo(() => {
        if (!hasActiveFilters) {
            return { taskGroups: defaultGroups, stats: defaultStats };
        }

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);

        const filtered = allTasks.filter((t) => {
            if (filterSearch && !t.title.toLowerCase().includes(filterSearch.toLowerCase())) return false;
            if (filterStatus && t.status !== filterStatus) return false;
            if (filterPriority && t.priority !== filterPriority) return false;
            return true;
        });

        const bucket = (test) => filtered.filter(test);
        const groups = {
            overdue: bucket((t) => { if (!t.due_date) return false; const d = new Date(t.due_date); d.setHours(0,0,0,0); return d < today; }),
            dueToday: bucket((t) => { if (!t.due_date) return false; const d = new Date(t.due_date); d.setHours(0,0,0,0); return d.getTime() === today.getTime(); }),
            upcoming: bucket((t) => { if (!t.due_date) return false; const d = new Date(t.due_date); d.setHours(0,0,0,0); return d > today && d <= weekEnd; }),
            later: bucket((t) => { if (!t.due_date) return false; const d = new Date(t.due_date); d.setHours(0,0,0,0); return d > weekEnd; }),
            noDueDate: bucket((t) => !t.due_date),
        };

        return {
            taskGroups: groups,
            stats: { total: filtered.length, overdue: groups.overdue.length, dueToday: groups.dueToday.length },
        };
    }, [allTasks, defaultGroups, defaultStats, filterSearch, filterStatus, filterPriority, hasActiveFilters]);

    const hasAnyTasks = Object.values(taskGroups).some(group => group.length > 0);

    return (
        <AuthenticatedLayout title="My Tasks">
            <PageHeader title="My Tasks" />

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <Card>
                    <div className="text-center">
                        <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{stats.total}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Total Tasks</p>
                    </div>
                </Card>
                <Card>
                    <div className="text-center">
                        <p className={`text-2xl font-semibold ${stats.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                            {stats.overdue}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Overdue</p>
                    </div>
                </Card>
                <Card>
                    <div className="text-center">
                        <p className={`text-2xl font-semibold ${stats.dueToday > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-900 dark:text-gray-100'}`}>
                            {stats.dueToday}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Due Today</p>
                    </div>
                </Card>
            </div>

            {/* Quick Add */}
            <div className="mb-6">
                <QuickAddTask
                    canAssignOthers={canAssignOthers}
                    users={users}
                    projects={projects}
                    priorities={priorities}
                />
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="relative flex-1 max-w-xs">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        placeholder="Search tasks..."
                        className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                </div>
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                    <option value="">All Statuses</option>
                    {TASK_STATUSES.map((s) => (
                        <option key={s} value={s}>{formatLabel(s)}</option>
                    ))}
                </select>
                <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                    <option value="">All Priorities</option>
                    {PRIORITIES.map((p) => (
                        <option key={p} value={p}>{formatLabel(p)}</option>
                    ))}
                </select>
                {hasActiveFilters && (
                    <button
                        onClick={() => { setFilterSearch(''); setFilterStatus(''); setFilterPriority(''); }}
                        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                    >
                        Clear
                    </button>
                )}
            </div>

            {hasAnyTasks ? (
                sections.map((section) => (
                    <TaskSection
                        key={section.key}
                        section={section}
                        tasks={taskGroups[section.key]}
                    />
                ))
            ) : (
                <Card>
                    <EmptyState
                        title={hasActiveFilters ? "No matching tasks" : "No pending tasks"}
                        description={hasActiveFilters ? "Try adjusting your filters." : "Tasks assigned to you will appear here, organized by due date."}
                    />
                </Card>
            )}
        </AuthenticatedLayout>
    );
}
