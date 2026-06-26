import { Link, router, usePage } from '@inertiajs/react';
import { useState, useCallback, useRef } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import StatusBadge from '../../Components/StatusBadge';
import Avatar from '../../Components/Avatar';
import Pagination from '../../Components/Pagination';
import EmptyState from '../../Components/EmptyState';
import { formatDate } from '../../utils';
import { ConfirmModal } from '../../Components/Modal';

const UnarchiveIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4l2-2m0 0l2 2m-2-2v4" />
    </svg>
);

const TrashIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

export default function Archived() {
    const { projects, auth, filters } = usePage().props;
    const canManageAll = auth.user?.permissions?.includes('manage-projects');
    const canManage = (project) => canManageAll || project.owner_id === auth.user?.id || project.user_is_admin;
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [search, setSearch] = useState(filters?.search || '');
    const debounceRef = useRef(null);

    const applyFilters = useCallback((overrides = {}) => {
        const params = { search: overrides.search ?? search };
        Object.keys(params).forEach((key) => { if (!params[key]) delete params[key]; });
        router.get('/projects/archived', params, { preserveState: true, preserveScroll: true });
    }, [search]);

    const handleSearchChange = (value) => {
        setSearch(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => applyFilters({ search: value }), 300);
    };

    const handleDelete = () => {
        if (deleteTarget) {
            router.delete(`/projects/${deleteTarget.id}`);
            setDeleteTarget(null);
        }
    };

    return (
        <AuthenticatedLayout title="Archived Projects">
            <div>
                <PageHeader
                    title="Archived Projects"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Projects', href: '/projects' },
                        { label: 'Archived' },
                    ]}
                />

                {/* Search */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <div className="relative flex-1 max-w-xs">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search archived projects..."
                            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>
                    {search && (
                        <button
                            onClick={() => { setSearch(''); router.get('/projects/archived', {}, { preserveState: true, preserveScroll: true }); }}
                            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                        >
                            Clear
                        </button>
                    )}
                </div>

                <Card padding={false}>
                    {projects.data.length > 0 ? (
                        <>
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Owner</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tasks</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Due Date</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {projects.data.map((project) => (
                                        <tr
                                            key={project.id}
                                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                                            onClick={() => router.visit(`/projects/${project.id}`)}
                                        >
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{project.name}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                <div className="flex items-center gap-2">
                                                    {project.owner && <Avatar name={project.owner.name} size="sm" />}
                                                    <span>{project.owner?.name || 'Unassigned'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                <span className="font-medium text-gray-900 dark:text-gray-100">{project.completed_tasks_count}</span>
                                                <span className="text-gray-400">/{project.tasks_count}</span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{formatDate(project.due_date) || '—'}</td>
                                            <td className="px-6 py-4 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1">
                                                    {canManage(project) && (
                                                        <>
                                                            <button
                                                                onClick={() => router.patch(`/projects/${project.id}/archive`, {}, { preserveScroll: true })}
                                                                className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                                                                title="Unarchive"
                                                            >
                                                                <UnarchiveIcon />
                                                            </button>
                                                            <button
                                                                onClick={() => setDeleteTarget(project)}
                                                                className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                                                title="Delete"
                                                            >
                                                                <TrashIcon />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <Pagination links={projects.links} />
                        </>
                    ) : (
                        <EmptyState
                            title={search ? "No matching archived projects" : "No archived projects"}
                            description={search ? "Try adjusting your search." : "Archived projects will appear here."}
                        />
                    )}
                </Card>
            </div>

            <ConfirmModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Project"
                message={`Delete project "${deleteTarget?.name}"? This will also delete all its tasks.`}
            />
        </AuthenticatedLayout>
    );
}
