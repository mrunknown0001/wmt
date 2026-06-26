import { useState } from 'react';
import { Link, usePage, router } from '@inertiajs/react';
import AuthenticatedLayout from '../Layouts/AuthenticatedLayout';
import Card from '../Components/Card';
import Avatar from '../Components/Avatar';
import StatusBadge from '../Components/StatusBadge';
import PriorityBadge from '../Components/PriorityBadge';
import EmptyState from '../Components/EmptyState';
import LinkButton from '../Components/LinkButton';
import DashboardSettingsPopover from '../Components/Dashboard/DashboardSettingsPopover';
import TaskStatsBar from '../Components/Dashboard/TaskStatsBar';
import ProjectProgressBar from '../Components/Dashboard/ProjectProgressBar';
import ActivityFeed from '../Components/Dashboard/ActivityFeed';
import DonutChart from '../Components/Dashboard/DonutChart';
import BarChart from '../Components/Dashboard/BarChart';
import TeamWorkload from '../Components/Dashboard/TeamWorkload';
import { formatDate } from '../utils';

function StatCard({ label, value, icon, color = 'blue', href }) {
    const colors = {
        blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
        green: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400',
        purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
        red: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    };

    const content = (
        <Card className="hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${colors[color]}`}>
                    {icon}
                </div>
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                    <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
                </div>
            </div>
        </Card>
    );

    return href ? <Link href={href} className="block">{content}</Link> : content;
}

export default function Dashboard() {
    const {
        auth,
        stats,
        recentProjects,
        myRecentTasks,
        dashboardPreferences,
        taskStats,
        activityFeed,
        charts,
        urgentItems,
        teamWorkload,
    } = usePage().props;

    const [preferences, setPreferences] = useState(dashboardPreferences || {});

    const isAdmin = auth.user?.roles?.some((r) => ['admin', 'supervisor'].includes(r));

    const handlePreferencesUpdate = (newPrefs) => {
        setPreferences(newPrefs);
        router.reload({ preserveScroll: true });
    };

    const greeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    };

    return (
        <AuthenticatedLayout title="Dashboard">
            <div>
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                            {greeting()}, {auth.user?.name}
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {preferences.showQuickActions && (
                            <div className="flex items-center gap-2">
                                <LinkButton href="/projects/create" size="sm" variant="secondary">
                                    <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                    </svg>
                                    New Project
                                </LinkButton>
                            </div>
                        )}
                        <DashboardSettingsPopover
                            preferences={preferences}
                            isAdmin={isAdmin}
                            onUpdate={handlePreferencesUpdate}
                        />
                    </div>
                </div>

                {/* Due Today / Overdue — full width */}
                {preferences.showDueToday && urgentItems?.length > 0 && (
                    <div className="mb-6">
                        <Card padding={false}>
                            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                <h2 className="text-base font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                    </svg>
                                    Due Today & Overdue
                                </h2>
                            </div>
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                {urgentItems.map((task) => {
                                    const isOverdue = task.due_date && new Date(task.due_date) < new Date(new Date().toDateString());
                                    return (
                                        <Link
                                            key={task.id}
                                            href={`/projects/${task.project_id}/tasks/${task.id}/edit`}
                                            className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                        >
                                            <div className={`w-1 h-8 rounded-full ${isOverdue ? 'bg-red-500' : 'bg-yellow-500'}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <PriorityBadge priority={task.priority} />
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{task.project?.name}</span>
                                                </div>
                                            </div>
                                            <span className={`text-xs whitespace-nowrap font-medium ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                                                {isOverdue ? 'Overdue' : 'Due today'} — {formatDate(task.due_date)}
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </Card>
                    </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <StatCard
                        label="Total Projects"
                        value={stats?.totalProjects ?? 0}
                        href="/projects"
                        color="blue"
                        icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>}
                    />
                    <StatCard
                        label="Active Projects"
                        value={stats?.activeProjects ?? 0}
                        color="green"
                        icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                    />
                    <StatCard
                        label="My Tasks"
                        value={stats?.myTasks ?? 0}
                        color="purple"
                        icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
                    />
                    <StatCard
                        label="Overdue"
                        value={stats?.overdueTasks ?? 0}
                        color="red"
                        icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    />
                </div>

                {/* Task Stats Bar */}
                {preferences.showTaskStats && taskStats && (
                    <div className="mb-6">
                        <TaskStatsBar taskStats={taskStats} />
                    </div>
                )}

                {/* Two-column: Projects + Tasks */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Recent Projects */}
                    <Card padding={false}>
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Recent Projects</h2>
                            <Link href="/projects" className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">View all</Link>
                        </div>
                        {recentProjects?.length > 0 ? (
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                {recentProjects.map((project) => (
                                    <Link
                                        key={project.id}
                                        href={`/projects/${project.id}`}
                                        className="block px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{project.name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <StatusBadge status={project.status} type="project" />
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        {project.completed_tasks_count}/{project.tasks_count} tasks
                                                    </span>
                                                </div>
                                            </div>
                                            {project.owner && <Avatar name={project.owner.name} size="sm" />}
                                        </div>
                                        {preferences.showProgressBars && project.tasks_count > 0 && (
                                            <ProjectProgressBar project={project} />
                                        )}
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                title="No projects yet"
                                description="Create your first project to get started"
                                action={<LinkButton href="/projects/create" size="sm">New Project</LinkButton>}
                            />
                        )}
                    </Card>

                    {/* My Upcoming Tasks */}
                    <Card padding={false}>
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">My Upcoming Tasks</h2>
                        </div>
                        {myRecentTasks?.length > 0 ? (
                            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                {myRecentTasks.map((task) => {
                                    const isOverdue = task.due_date && new Date(task.due_date) < new Date();
                                    return (
                                        <Link
                                            key={task.id}
                                            href={`/projects/${task.project_id}/tasks/${task.id}/edit`}
                                            className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <PriorityBadge priority={task.priority} />
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{task.project?.name}</span>
                                                </div>
                                            </div>
                                            {(task.start_date || task.due_date) && (
                                                <span className={`text-xs whitespace-nowrap ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                                                    {task.start_date && task.due_date ? `${formatDate(task.start_date)} → ${formatDate(task.due_date)}` : formatDate(task.due_date) || formatDate(task.start_date)}
                                                </span>
                                            )}
                                        </Link>
                                    );
                                })}
                            </div>
                        ) : (
                            <EmptyState
                                title="No pending tasks"
                                description="Tasks assigned to you will appear here"
                            />
                        )}
                    </Card>
                </div>

                {/* Charts — two-column */}
                {preferences.showCharts && charts && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <DonutChart data={charts.tasksByStatus} title="Tasks by Status" />
                        <BarChart data={charts.tasksByPriority} title="Tasks by Priority" />
                    </div>
                )}

                {/* Activity Feed */}
                {preferences.showActivityFeed && activityFeed?.length > 0 && (
                    <div className="mb-6">
                        <ActivityFeed activities={activityFeed} />
                    </div>
                )}

                {/* Team Workload — admin/supervisor only */}
                {preferences.showTeamWorkload && isAdmin && teamWorkload?.length > 0 && (
                    <div className="mb-6">
                        <TeamWorkload users={teamWorkload} />
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
