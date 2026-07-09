import { router, usePage } from '@inertiajs/react';
import { useState, useCallback, useRef } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Avatar from '../../Components/Avatar';
import Pagination from '../../Components/Pagination';
import EmptyState from '../../Components/EmptyState';
import { formatDate, formatLabel } from '../../utils';
import { ConfirmModal } from '../../Components/Modal';
import ProjectContextMenu from '../../Components/ProjectContextMenu';
import DuplicateProjectModal from '../../Components/DuplicateProjectModal';

export default function Archived() {
    const { projects, auth, filters, owners = [] } = usePage().props;
    const canManageAll = auth.user?.permissions?.includes('manage-projects');
    const canManage = (project) => canManageAll || project.owner_id === auth.user?.id || project.user_is_admin;
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [duplicateTarget, setDuplicateTarget] = useState(null);
    const [search, setSearch] = useState(filters?.search || '');
    const [owner, setOwner] = useState(filters?.owner || '');
    const debounceRef = useRef(null);

    const applyFilters = useCallback((overrides = {}) => {
        const params = {
            search: overrides.search ?? search,
            owner: overrides.owner ?? owner,
        };
        Object.keys(params).forEach((key) => { if (!params[key]) delete params[key]; });
        router.get('/projects/archived', params, { preserveState: true, preserveScroll: true });
    }, [search, owner]);

    const handleSearchChange = (value) => {
        setSearch(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => applyFilters({ search: value }), 300);
    };

    const handleOwnerChange = (value) => {
        setOwner(value);
        applyFilters({ owner: value });
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

                {/* Filters */}
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
                    <select
                        value={owner}
                        onChange={(e) => handleOwnerChange(e.target.value)}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="">All Owners</option>
                        {owners.map((o) => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                    </select>
                    {(search || owner) && (
                        <button
                            onClick={() => { setSearch(''); setOwner(''); router.get('/projects/archived', {}, { preserveState: true, preserveScroll: true }); }}
                            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                        >
                            Clear
                        </button>
                    )}
                    <div className="ml-auto">
                        <button
                            onClick={() => router.visit('/projects')}
                            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                            </svg>
                            Active Projects
                        </button>
                    </div>
                </div>

                <Card padding={false}>
                    {projects.data.length > 0 ? (
                        <>
                            <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">Owner</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">Tasks</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Due Date</th>
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
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                                                <div className="flex items-center gap-2">
                                                    {project.owner && <Avatar name={project.owner.name} size="sm" />}
                                                    <span>{project.owner?.name || 'Unassigned'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                                                <span className="font-medium text-gray-900 dark:text-gray-100">{project.completed_tasks_count}</span>
                                                <span className="text-gray-400">/{project.tasks_count}</span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">{formatDate(project.due_date) || '—'}</td>
                                            <td className="px-6 py-4 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                                                {canManage(project) && (
                                                    <div className="flex items-center justify-end">
                                                        <ProjectContextMenu
                                                            project={project}
                                                            isArchived={true}
                                                            onEdit={() => router.visit(`/projects/${project.id}/edit`)}
                                                            onDuplicate={() => setDuplicateTarget(project)}
                                                            onArchive={() => router.patch(`/projects/${project.id}/archive`, {}, { preserveScroll: true })}
                                                            onDelete={() => setDeleteTarget(project)}
                                                        />
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
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

            <DuplicateProjectModal
                isOpen={!!duplicateTarget}
                onClose={() => setDuplicateTarget(null)}
                project={duplicateTarget}
            />
        </AuthenticatedLayout>
    );
}
