import { Link, router, usePage } from '@inertiajs/react';
import { useState, useCallback, useRef } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Pagination from '../../Components/Pagination';

const STATUS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'on_hold', label: 'On Hold' },
    { value: 'completed', label: 'Completed' },
    { value: 'archived', label: 'Archived' },
    { value: 'all', label: 'All Statuses' },
];

const statusColor = (s) => ({
    active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    on_hold: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    archived: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}[s] || 'bg-gray-100 text-gray-700');

const humanize = (s) => (s || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export default function Projects() {
    const { projects, scopeLabel, filters = {} } = usePage().props;
    const [search, setSearch] = useState(filters.search || '');
    const debounceRef = useRef(null);

    const apply = useCallback((overrides = {}) => {
        const params = {
            scope: filters.scope || undefined,
            scope_id: filters.scope_id || undefined,
            status: overrides.status ?? filters.status,
            search: overrides.search ?? search,
        };
        Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
        router.get(route('executive-dashboard.projects'), params, { preserveState: true, preserveScroll: true });
    }, [filters, search]);

    const onSearch = (v) => {
        setSearch(v);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => apply({ search: v }), 300);
    };

    const selectCls = 'py-1.5 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

    return (
        <AuthenticatedLayout title="Projects — Executive Dashboard">
            <PageHeader
                title="Projects"
                breadcrumbs={[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Executive Dashboard', href: '/executive-dashboard' },
                    { label: 'Projects' },
                ]}
            />

            <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                    {scopeLabel}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{projects.total} project{projects.total === 1 ? '' : 's'}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => onSearch(e.target.value)}
                    placeholder="Search projects..."
                    className="flex-1 min-w-[14rem] max-w-xs px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <select value={filters.status || 'active'} onChange={(e) => apply({ status: e.target.value })} className={selectCls}>
                    {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>

            <Card padding={false}>
                {projects.data.length === 0 ? (
                    <p className="p-10 text-center text-gray-500 dark:text-gray-400">No projects match these filters.</p>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        {['Project', 'Owner', 'Status', 'Tasks', 'Completed', 'Overdue', 'Rate'].map((h) => (
                                            <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {projects.data.map((p) => {
                                        const rate = p.tasks_count > 0 ? Math.round((p.completed_tasks_count / p.tasks_count) * 100) : null;
                                        return (
                                            <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                <td className="px-6 py-4">
                                                    <Link href={`/projects/${p.id}`} className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400">
                                                        {p.name}
                                                    </Link>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{p.owner?.name || '—'}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusColor(p.status)}`}>
                                                        {humanize(p.status)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{p.tasks_count}</td>
                                                <td className="px-6 py-4 text-sm text-green-600 dark:text-green-400">{p.completed_tasks_count}</td>
                                                <td className={`px-6 py-4 text-sm ${p.overdue_tasks_count > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>{p.overdue_tasks_count}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{rate === null ? '—' : `${rate}%`}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <Pagination links={projects.links} />
                    </>
                )}
            </Card>
        </AuthenticatedLayout>
    );
}
