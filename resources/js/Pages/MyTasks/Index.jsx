import { useState, useEffect, useRef } from 'react';
import { Link, router, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Pagination from '../../Components/Pagination';
import PriorityBadge from '../../Components/PriorityBadge';
import StatusBadge from '../../Components/StatusBadge';
import Button from '../../Components/Button';
import EmptyState from '../../Components/EmptyState';
import { formatDate, formatLabel, taskEditUrl } from '../../utils';

const TASK_STATUSES = ['backlog', 'to_do', 'in_progress', 'in_review', 'done', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

const activeSections = [
    { key: 'overdue', label: 'Overdue', color: 'red' },
    { key: 'dueToday', label: 'Due Today', color: 'yellow' },
    { key: 'upcoming', label: 'Upcoming (Next 7 Days)', color: 'blue' },
    { key: 'later', label: 'Later', color: 'gray' },
    { key: 'noDueDate', label: 'No Due Date', color: 'gray' },
];

const completedSections = [
    { key: 'completedOnTime', label: 'Completed On Time', color: 'green' },
    { key: 'completedLate', label: 'Completed Late', color: 'orange' },
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
    green: {
        header: 'text-green-700 dark:text-green-400',
        badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
        row: 'border-l-green-500',
    },
    orange: {
        header: 'text-orange-700 dark:text-orange-400',
        badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
        row: 'border-l-orange-500',
    },
};

function CompletionBadge({ task }) {
    if (task.status !== 'done' && task.status !== 'cancelled') return null;

    const isLate = task.due_date && task.completed_at && new Date(task.completed_at) > new Date(new Date(task.due_date).setHours(23, 59, 59, 999));
    const isOnTime = !isLate;

    return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${
            isOnTime
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
        }`}>
            {isOnTime ? (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            ) : (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                    <circle cx="12" cy="12" r="9" strokeLinecap="round" />
                </svg>
            )}
            {isOnTime ? 'On Time' : 'Late'}
        </span>
    );
}

function TaskSection({ section, tasks, showCompletionBadge = false }) {
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
                                {showCompletionBadge && <CompletionBadge task={task} />}
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

export default function Index({ taskGroups, isCompletedFilter, pagination, stats, filters, canAssignOthers = false, users = [], projects = [], statuses = TASK_STATUSES, priorities = PRIORITIES }) {
    const [filterSearch, setFilterSearch] = useState(filters.search || '');
    const [filterStatus, setFilterStatus] = useState(filters.status || '');
    const [filterPriority, setFilterPriority] = useState(filters.priority || '');
    const [filterDue, setFilterDue] = useState(filters.due || '');
    const searchTimeout = useRef(null);

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

    const applyFilters = (overrides = {}) => {
        const params = {
            status: overrides.status ?? filterStatus,
            priority: overrides.priority ?? filterPriority,
            search: overrides.search ?? filterSearch,
            due: overrides.due ?? filterDue,
        };

        // Remove empty params
        Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });

        router.get('/my-tasks', params, {
            preserveState: true,
            preserveScroll: true,
        });
    };

    const handleSearchChange = (value) => {
        setFilterSearch(value);
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => applyFilters({ search: value }), 400);
    };

    const handleStatusChange = (value) => {
        setFilterStatus(value);
        applyFilters({ status: value });
    };

    const handlePriorityChange = (value) => {
        setFilterPriority(value);
        applyFilters({ priority: value });
    };

    const clearFilters = () => {
        setFilterSearch('');
        setFilterStatus('');
        setFilterPriority('');
        setFilterDue('');
        router.get('/my-tasks', {}, { preserveState: true, preserveScroll: true });
    };

    // Clicking a stat card filters by due-date bucket ("Active Tasks" clears it).
    const handleDueCard = (value) => {
        setFilterDue(value);
        applyFilters({ due: value });
    };

    const hasActiveFilters = filterSearch || filterStatus || filterPriority || filterDue;
    const sections = isCompletedFilter ? completedSections : activeSections;
    const hasAnyTasks = Object.values(taskGroups).some(group => group.length > 0);

    return (
        <AuthenticatedLayout title="My Tasks">
            <PageHeader
                title="My Tasks"
                actions={
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            const params = new URLSearchParams();
                            if (filterStatus) params.set('status', filterStatus);
                            if (filterPriority) params.set('priority', filterPriority);
                            if (filterSearch) params.set('search', filterSearch);
                            const qs = params.toString();
                            window.location.href = `/my-tasks/export${qs ? '?' + qs : ''}`;
                        }}
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Export
                    </Button>
                }
            />

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {[
                    { value: '', label: 'Active Tasks', count: stats.total, tone: 'text-gray-900 dark:text-gray-100', title: 'Show all active tasks' },
                    { value: 'overdue', label: 'Overdue', count: stats.overdue, tone: stats.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100', title: 'Show only overdue tasks' },
                    { value: 'today', label: 'Due Today', count: stats.dueToday, tone: stats.dueToday > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-900 dark:text-gray-100', title: 'Show only tasks due today' },
                ].map((card) => {
                    const active = filterDue === card.value;
                    return (
                        <button
                            key={card.label}
                            type="button"
                            onClick={() => handleDueCard(card.value)}
                            aria-pressed={active}
                            title={card.title}
                            className={`bg-white dark:bg-gray-800 rounded-lg shadow p-4 transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                active ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-blue-300 dark:hover:ring-blue-700'
                            }`}
                        >
                            <div className="text-center">
                                <p className={`text-2xl font-semibold ${card.tone}`}>{card.count}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{card.label}</p>
                            </div>
                        </button>
                    );
                })}
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
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder="Search tasks..."
                        className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                </div>
                <select
                    value={filterStatus}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                    <option value="">All Statuses</option>
                    {TASK_STATUSES.map((s) => (
                        <option key={s} value={s}>{formatLabel(s)}</option>
                    ))}
                </select>
                <select
                    value={filterPriority}
                    onChange={(e) => handlePriorityChange(e.target.value)}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                    <option value="">All Priorities</option>
                    {PRIORITIES.map((p) => (
                        <option key={p} value={p}>{formatLabel(p)}</option>
                    ))}
                </select>
                {hasActiveFilters && (
                    <button
                        onClick={clearFilters}
                        className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                    >
                        Clear
                    </button>
                )}
            </div>

            {hasAnyTasks ? (
                <>
                    {sections.map((section) => (
                        <TaskSection
                            key={section.key}
                            section={section}
                            tasks={taskGroups[section.key]}
                            showCompletionBadge={isCompletedFilter}
                        />
                    ))}
                    {pagination?.links && (
                        <div className="mt-4">
                            <Pagination links={pagination.links} />
                        </div>
                    )}
                </>
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
