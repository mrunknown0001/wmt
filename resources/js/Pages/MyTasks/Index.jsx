import { Link } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import PriorityBadge from '../../Components/PriorityBadge';
import StatusBadge from '../../Components/StatusBadge';
import EmptyState from '../../Components/EmptyState';
import { formatDate } from '../../utils';

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
                            href={`/projects/${task.project_id}/tasks/${task.id}/edit`}
                            className={`flex items-center gap-4 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-l-3 ${style.row}`}
                        >
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                    {task.title}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {task.project?.name}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <PriorityBadge priority={task.priority} />
                                <StatusBadge status={task.status} type="task" />
                                {task.due_date && (
                                    <span className={`text-xs whitespace-nowrap ${
                                        section.key === 'overdue' ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'
                                    }`}>
                                        {formatDate(task.due_date)}
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

export default function Index({ taskGroups, stats }) {
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
                        title="No pending tasks"
                        description="Tasks assigned to you will appear here, organized by due date."
                    />
                </Card>
            )}
        </AuthenticatedLayout>
    );
}
