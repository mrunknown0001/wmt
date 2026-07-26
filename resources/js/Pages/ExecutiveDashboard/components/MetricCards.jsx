import { Link } from '@inertiajs/react';
import Card from '../../../Components/Card';

/**
 * Executive Summary cards. Each links to a filtered list. The three task cards go
 * to the org-wide task browser, carrying the dashboard's current scope so the
 * drill-through matches the exact number on the card. Active Projects goes to the
 * projects list (which isn't org-scopeable).
 */
const buildHref = (path, scope, scopeId, extra = {}) => {
    const params = new URLSearchParams();
    if (scope && scope !== 'org') {
        params.set('scope', scope);
        if (scopeId) params.set('scope_id', scopeId);
    }
    Object.entries(extra).forEach(([k, v]) => v && params.set(k, v));
    const qs = params.toString();
    return path + (qs ? `?${qs}` : '');
};
const buildTasksHref = (scope, scopeId, extra = {}) => buildHref('/executive-dashboard/tasks', scope, scopeId, extra);

export default function MetricCards({ data, scope = 'org', scopeId = null }) {
    const metrics = [
        { key: 'activeProjects', label: 'Active Projects', href: buildHref('/executive-dashboard/projects', scope, scopeId), title: 'View active projects in this scope', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
        { key: 'totalTasks', label: 'Total Tasks', href: buildTasksHref(scope, scopeId), title: 'View all tasks in this scope', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
        { key: 'completionRate', label: 'Completion Rate', href: buildTasksHref(scope, scopeId, { status: 'done' }), title: 'View completed tasks', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/30', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', suffix: '%' },
        { key: 'overdueTasks', label: 'Overdue Tasks', href: buildTasksHref(scope, scopeId, { due: 'overdue' }), title: 'View overdue tasks', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30', icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.map((m) => (
                <Link
                    key={m.key}
                    href={m.href}
                    title={m.title}
                    className="block rounded-xl transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <Card className="h-full">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${m.bg}`}>
                                <svg className={`h-5 w-5 ${m.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={m.icon} />
                                </svg>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                    {data[m.key] ?? 0}{m.suffix || ''}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{m.label}</p>
                            </div>
                        </div>
                    </Card>
                </Link>
            ))}
        </div>
    );
}
