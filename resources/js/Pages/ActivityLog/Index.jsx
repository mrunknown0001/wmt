import { useState, useRef, useCallback } from 'react';
import { router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Badge from '../../Components/Badge';
import Avatar from '../../Components/Avatar';
import Pagination from '../../Components/Pagination';
import { formatLabel, timeAgo } from '../../utils';

const ENTITY_COLORS = {
    project: 'blue',
    task: 'purple',
    user: 'green',
    division: 'orange',
    department: 'indigo',
    team: 'yellow',
    task_section: 'gray',
};

const ACTION_COLORS = {
    created: 'green',
    updated: 'blue',
    deleted: 'red',
};

function ActivityOverTimeChart({ data }) {
    const entries = Object.entries(data || {});
    if (entries.length === 0) {
        return (
            <Card>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Activity Over Time (30 days)</h3>
                <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
            </Card>
        );
    }
    const maxCount = Math.max(...entries.map(([, c]) => c), 1);

    return (
        <Card>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Activity Over Time (30 days)</h3>
            <div className="flex items-end gap-0.5 h-32">
                {entries.map(([date, count]) => (
                    <div key={date} className="flex-1 flex flex-col items-center justify-end h-full group relative" title={`${date}: ${count}`}>
                        <div className="absolute -top-5 hidden group-hover:block text-xs text-gray-500 bg-white dark:bg-gray-800 px-1 rounded shadow">{count}</div>
                        <div
                            className="w-full bg-blue-500 dark:bg-blue-400 rounded-t transition-all"
                            style={{ height: `${Math.max((count / maxCount) * 100, 4)}%` }}
                        />
                    </div>
                ))}
            </div>
            <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-400">{entries[0]?.[0]}</span>
                <span className="text-xs text-gray-400">{entries[entries.length - 1]?.[0]}</span>
            </div>
        </Card>
    );
}

function MostActiveUsersChart({ data }) {
    if (!data?.length) {
        return (
            <Card>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Most Active Users</h3>
                <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
            </Card>
        );
    }
    const maxCount = Math.max(...data.map((u) => u.count), 1);

    return (
        <Card>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Most Active Users</h3>
            <div className="space-y-2">
                {data.map((user) => (
                    <div key={user.user_id} className="flex items-center gap-3">
                        <Avatar name={user.name} size="sm" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 w-24 truncate">{user.name}</span>
                        <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                            <div
                                className="h-full bg-green-500 dark:bg-green-400 rounded flex items-center px-2"
                                style={{ width: `${Math.max((user.count / maxCount) * 100, 8)}%` }}
                            >
                                <span className="text-xs font-medium text-white">{user.count}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

function SummaryChart({ title, data, colorMap }) {
    const entries = Object.entries(data || {});
    if (entries.length === 0) {
        return (
            <Card>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
                <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
            </Card>
        );
    }
    const total = entries.reduce((sum, [, c]) => sum + c, 0);

    return (
        <Card>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
            <div className="space-y-2.5">
                {entries.map(([key, count]) => (
                    <div key={key} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Badge color={colorMap[key] || 'gray'}>{formatLabel(key)}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{count}</span>
                            <span className="text-xs text-gray-400 w-10 text-right">{total > 0 ? Math.round((count / total) * 100) : 0}%</span>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

export default function Index() {
    const { activities, charts, filters, filterOptions } = usePage().props;
    const [localFilters, setLocalFilters] = useState(filters);
    const debounceRef = useRef(null);

    const applyFilters = useCallback((updated) => {
        const params = { ...updated };
        Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
        router.get('/activity-log', params, { preserveState: true, preserveScroll: true });
    }, []);

    const handleChange = (key, value) => {
        const updated = { ...localFilters, [key]: value };
        setLocalFilters(updated);
        if (key === 'search') {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => applyFilters(updated), 300);
            return;
        }
        applyFilters(updated);
    };

    const clearFilters = () => {
        const cleared = { user_id: '', entity_type: '', action: '', date_from: '', date_to: '', search: '' };
        setLocalFilters(cleared);
        applyFilters(cleared);
    };

    const hasActiveFilters = Object.values(localFilters).some((v) => v);

    return (
        <AuthenticatedLayout title="Activity Log">
            <div>
                <PageHeader
                    title="Activity Log"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Activity Log' },
                    ]}
                />

                {/* Filters */}
                <Card className="mb-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                        <div className="relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                value={localFilters.search || ''}
                                onChange={(e) => handleChange('search', e.target.value)}
                                placeholder="Search..."
                                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                        </div>
                        <select
                            value={localFilters.user_id || ''}
                            onChange={(e) => handleChange('user_id', e.target.value)}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                            <option value="">All Users</option>
                            {filterOptions.users.map((u) => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                        <select
                            value={localFilters.entity_type || ''}
                            onChange={(e) => handleChange('entity_type', e.target.value)}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                            <option value="">All Types</option>
                            {filterOptions.entityTypes.map((t) => (
                                <option key={t} value={t}>{formatLabel(t)}</option>
                            ))}
                        </select>
                        <select
                            value={localFilters.action || ''}
                            onChange={(e) => handleChange('action', e.target.value)}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                            <option value="">All Actions</option>
                            {filterOptions.actions.map((a) => (
                                <option key={a} value={a}>{formatLabel(a)}</option>
                            ))}
                        </select>
                        <input
                            type="date"
                            value={localFilters.date_from || ''}
                            onChange={(e) => handleChange('date_from', e.target.value)}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            placeholder="From"
                        />
                        <input
                            type="date"
                            value={localFilters.date_to || ''}
                            onChange={(e) => handleChange('date_to', e.target.value)}
                            className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            placeholder="To"
                        />
                    </div>
                    {hasActiveFilters && (
                        <div className="mt-3 flex justify-end">
                            <button
                                onClick={clearFilters}
                                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                            >
                                Clear filters
                            </button>
                        </div>
                    )}
                </Card>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <ActivityOverTimeChart data={charts.activityOverTime} />
                    <MostActiveUsersChart data={charts.mostActiveUsers} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <SummaryChart title="By Entity Type" data={charts.byEntityType} colorMap={ENTITY_COLORS} />
                    <SummaryChart title="By Action" data={charts.byAction} colorMap={ACTION_COLORS} />
                </div>

                {/* Activity Feed */}
                <Card padding={false}>
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Activity Feed ({activities.total} total)
                        </h2>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {activities.data.length > 0 ? (
                            activities.data.map((log) => (
                                <div key={log.id} className="flex items-start gap-3 px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                    <Avatar name={log.user?.name || '?'} size="sm" className="mt-0.5 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            <span className="font-medium">{log.user?.name || 'System'}</span>{' '}
                                            {log.description || (
                                                <>
                                                    changed <span className="font-medium">{formatLabel(log.field)}</span>
                                                    {log.old_value && <> from <span className="text-gray-500 dark:text-gray-400">{log.old_value}</span></>}
                                                    {log.new_value && <> to <span className="font-medium">{log.new_value}</span></>}
                                                </>
                                            )}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <Badge color={ENTITY_COLORS[log.entity_type] || 'gray'}>
                                                {formatLabel(log.entity_type)}
                                            </Badge>
                                            <Badge color={ACTION_COLORS[log.action] || 'gray'}>
                                                {formatLabel(log.action)}
                                            </Badge>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                                                {log.entity_name}
                                            </span>
                                            <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap ml-auto">
                                                {timeAgo(log.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="px-6 py-12 text-center text-sm text-gray-400">
                                {hasActiveFilters ? 'No matching activity found.' : 'No activity logged yet.'}
                            </div>
                        )}
                    </div>
                    <Pagination links={activities.links} />
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
