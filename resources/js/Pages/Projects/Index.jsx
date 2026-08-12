import { router, usePage } from '@inertiajs/react';
import { useState, useCallback, useRef, useEffect } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import StatusBadge from '../../Components/StatusBadge';
import Avatar from '../../Components/Avatar';
import LinkButton from '../../Components/LinkButton';
import Button from '../../Components/Button';
import Pagination from '../../Components/Pagination';
import EmptyState from '../../Components/EmptyState';
import { formatDate, formatLabel } from '../../utils';
import { ConfirmModal } from '../../Components/Modal';
import ProjectContextMenu from '../../Components/ProjectContextMenu';
import DuplicateProjectModal from '../../Components/DuplicateProjectModal';
import FolderTree, { FolderIcon, folderAncestors } from '../../Components/FolderTree';
import FolderNameModal from '../../Components/FolderNameModal';
import MoveToFolderModal from '../../Components/MoveToFolderModal';

const PROJECT_STATUSES = ['active', 'on_hold', 'completed'];

export default function Index() {
    const { projects, auth, filters, owners = [], folders = [] } = usePage().props;

    // Hiding the button is courtesy, not the gate — ProjectPolicy::create and
    // StoreProjectRequest are what actually stop the request.
    const canCreateProject = auth.user?.can_create_project !== false;
    const canManageAll = auth.user?.permissions?.includes('manage-projects');
    const canManage = (project) => canManageAll || project.owner_id === auth.user?.id || project.user_is_admin;
    // Archive and delete stay with the owner (or a global manager) — a project
    // admin can edit but not retire the project.
    const canArchiveOrDelete = (project) => canManageAll || project.owner_id === auth.user?.id;
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [duplicateTarget, setDuplicateTarget] = useState(null);
    const [moveTarget, setMoveTarget] = useState(null);
    const [folderModal, setFolderModal] = useState(null); // { mode: 'create'|'rename', folder?, parent? }
    const [folderError, setFolderError] = useState(null);
    const [folderProcessing, setFolderProcessing] = useState(false);
    const [deleteFolderTarget, setDeleteFolderTarget] = useState(null);
    const [search, setSearch] = useState(filters?.search || '');
    const [status, setStatus] = useState(filters?.status || '');
    const [owner, setOwner] = useState(filters?.owner || '');
    const [draggedProject, setDraggedProject] = useState(null);
    const [toast, setToast] = useState(null);
    const debounceRef = useRef(null);
    const toastRef = useRef(null);

    const view = filters?.view === 'folders' ? 'folders' : 'all';
    const selectedFolder = filters?.folder || 'root';

    const applyFilters = useCallback((overrides = {}) => {
        const params = {
            search: overrides.search ?? search,
            status: overrides.status ?? status,
            owner: overrides.owner ?? owner,
            view: overrides.view ?? (view === 'folders' ? 'folders' : ''),
            folder: overrides.folder ?? (view === 'folders' ? selectedFolder : ''),
        };
        if (params.view !== 'folders') delete params.folder;
        Object.keys(params).forEach((key) => { if (!params[key]) delete params[key]; });
        router.get('/projects', params, { preserveState: true, preserveScroll: true });
    }, [search, status, owner, view, selectedFolder]);

    const handleSearchChange = (value) => {
        setSearch(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => applyFilters({ search: value }), 300);
    };

    const handleStatusChange = (value) => {
        setStatus(value);
        applyFilters({ status: value });
    };

    const handleOwnerChange = (value) => {
        setOwner(value);
        applyFilters({ owner: value });
    };

    const clearFilters = () => {
        setSearch('');
        setStatus('');
        setOwner('');
        applyFilters({ search: '', status: '', owner: '' });
    };

    const hasActiveFilters = search || status || owner;

    const handleDelete = () => {
        if (deleteTarget) {
            router.delete(`/projects/${deleteTarget.id}`);
            setDeleteTarget(null);
        }
    };

    const switchView = (newView) => {
        if (newView === view) return;
        applyFilters({ view: newView === 'folders' ? 'folders' : '', folder: newView === 'folders' ? 'root' : '' });
    };

    const selectFolder = (folderId) => {
        applyFilters({ view: 'folders', folder: String(folderId) });
    };

    const submitFolderModal = (name) => {
        setFolderProcessing(true);
        setFolderError(null);
        const options = {
            preserveScroll: true,
            preserveState: true,
            onFinish: () => setFolderProcessing(false),
            onSuccess: () => setFolderModal(null),
            onError: (errors) => setFolderError(errors.name || errors.parent_id),
        };
        if (folderModal?.mode === 'rename') {
            router.patch(`/folders/${folderModal.folder.id}`, { name }, options);
        } else {
            router.post('/folders', { name, parent_id: folderModal?.parent?.id ?? null }, options);
        }
    };

    const handleDeleteFolder = () => {
        if (deleteFolderTarget) {
            router.delete(`/folders/${deleteFolderTarget.id}`, { preserveScroll: true, preserveState: true });
            setDeleteFolderTarget(null);
        }
    };

    const handleDropProject = (projectId, folderId) => {
        router.patch(`/projects/${projectId}/folder`, { folder_id: folderId }, { preserveScroll: true });
    };

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        if (toastRef.current) clearTimeout(toastRef.current);
        toastRef.current = setTimeout(() => setToast(null), 3000);
    };

    const handleTogglePin = async (project) => {
        try {
            const response = await fetch(`/projects/${project.id}/toggle-pin`, {
                method: 'PATCH',
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });

            if (response.ok) {
                const data = await response.json();
                showToast(data.is_pinned ? 'Project pinned to top' : 'Project unpinned');
                router.reload({ preserveScroll: true });
            } else {
                showToast('Failed to update project', 'error');
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error');
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDropReorder = async (e, targetProject) => {
        e.preventDefault();
        if (!draggedProject || draggedProject.id === targetProject.id) return;

        const projectsList = projects.data || [];
        const draggedIndex = projectsList.findIndex(p => p.id === draggedProject.id);
        const targetIndex = projectsList.findIndex(p => p.id === targetProject.id);

        if (draggedIndex === -1 || targetIndex === -1) return;

        // Prevent dragging pinned projects below non-pinned or vice versa
        if (draggedProject.is_pinned !== targetProject.is_pinned) return;

        const reorderedProjects = [...projectsList];
        const [movedProject] = reorderedProjects.splice(draggedIndex, 1);
        reorderedProjects.splice(targetIndex, 0, movedProject);

        // Update positions based on pin status
        const pinnedProjects = reorderedProjects.filter(p => p.is_pinned);
        const unpinnedProjects = reorderedProjects.filter(p => !p.is_pinned);

        const updates = [
            ...pinnedProjects.map((p, i) => ({ id: p.id, position: i })),
            ...unpinnedProjects.map((p, i) => ({ id: p.id, position: i })),
        ];

        try {
            const response = await fetch('/projects/reorder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({ projects: updates }),
            });

            if (response.ok) {
                showToast('Projects reordered');
                router.reload({ preserveScroll: true });
            } else {
                showToast('Failed to reorder projects', 'error');
            }
        } catch (error) {
            showToast('Error: ' + error.message, 'error');
        }
    };

    const breadcrumbChain = view === 'folders' && selectedFolder !== 'root'
        ? folderAncestors(folders, selectedFolder)
        : [];

    // Creating a project while browsing a folder pre-selects that folder
    const newProjectHref = view === 'folders' && selectedFolder !== 'root'
        ? `/projects/create?folder=${selectedFolder}`
        : '/projects/create';

    const tabClass = (active) =>
        `px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            active
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
        }`;

    const projectTable = (
        <Card padding={false}>
            {projects.data.length > 0 ? (
                <>
                    <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Folder</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">Owner</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">Tasks</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Due Date</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {projects.data.map((project, index) => {
                                const isPinned = project.is_pinned;
                                const isLastPinned = isPinned && (index === projects.data.length - 1 || !projects.data[index + 1].is_pinned);
                                const showSeparator = isLastPinned;

                                return (
                                    <>
                                        <tr
                                            key={project.id}
                                            className={`transition-colors ${isPinned ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''} ${draggedProject?.id === project.id ? 'opacity-50 bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'} ${canManage(project) ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                                            onClick={() => router.visit(`/projects/${project.id}`)}
                                            draggable={canManage(project)}
                                            onDragStart={(e) => {
                                                e.stopPropagation();
                                                setDraggedProject(project);
                                                e.dataTransfer.effectAllowed = 'move';
                                            }}
                                            onDragEnd={() => setDraggedProject(null)}
                                            onDragOver={handleDragOver}
                                            onDrop={(e) => handleDropReorder(e, project)}
                                        >
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                                                <div className="flex items-center gap-2">
                                                    {isPinned && (
                                                        <svg className="h-4 w-4 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                                            <path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                                        </svg>
                                                    )}
                                                    <span>{project.name}</span>
                                                </div>
                                            </td>
                                    <td className="px-6 py-4 text-sm">
                                        <StatusBadge status={project.status} type="project" />
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                                        {project.folder ? (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-300">
                                                <FolderIcon folder={folders.find((f) => f.id === project.folder.id) || { is_system: false }} className="h-3.5 w-3.5" />
                                                {project.folder.name}
                                            </span>
                                        ) : '—'}
                                    </td>
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
                                                            isArchived={project.status === 'archived'}
                                                            onEdit={() => router.visit(`/projects/${project.id}/edit`)}
                                                            onDuplicate={() => setDuplicateTarget(project)}
                                                            onMoveToFolder={() => setMoveTarget(project)}
                                                            onTogglePin={() => handleTogglePin(project)}
                                                            onArchive={() => router.patch(`/projects/${project.id}/archive`, {}, { preserveScroll: true })}
                                                            onDelete={() => setDeleteTarget(project)}
                                                            canArchive={canArchiveOrDelete(project)}
                                                            canDelete={canArchiveOrDelete(project)}
                                                        />
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                        {showSeparator && (
                                            <tr className="h-1 bg-gradient-to-r from-amber-200 to-transparent dark:from-amber-900/30">
                                                <td colSpan="7" className="p-0"></td>
                                            </tr>
                                        )}
                                    </>
                                );
                            })}
                        </tbody>
                    </table>
                    </div>
                    <Pagination links={projects.links} />
                </>
            ) : (
                <EmptyState
                    title={hasActiveFilters ? 'No matching projects' : view === 'folders' ? 'No projects in this folder' : 'No projects yet'}
                    description={
                        hasActiveFilters
                            ? 'Try adjusting your filters.'
                            : view === 'folders'
                                ? 'Move projects here or create a new one.'
                                : 'Create your first project to get started'
                    }
                    action={!hasActiveFilters && canCreateProject && <LinkButton href={newProjectHref} size="sm">New Project</LinkButton>}
                />
            )}
        </Card>
    );

    return (
        <AuthenticatedLayout title="Projects">
            <div>
                <PageHeader
                    title="Projects"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Projects' },
                    ]}
                    actions={canCreateProject && <LinkButton href={newProjectHref}>New Project</LinkButton>}
                />

                {/* View tabs + Filter Bar */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                        <button onClick={() => switchView('all')} className={tabClass(view === 'all')}>All Projects</button>
                        <button onClick={() => switchView('folders')} className={tabClass(view === 'folders')}>Folders</button>
                    </div>
                    <div className="relative flex-1 max-w-xs">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search projects..."
                            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>
                    <select
                        value={status}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="">All Statuses</option>
                        {PROJECT_STATUSES.map((s) => (
                            <option key={s} value={s}>{formatLabel(s)}</option>
                        ))}
                    </select>
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
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                        >
                            Clear
                        </button>
                    )}
                    <div className="ml-auto">
                        <button
                            onClick={() => router.visit('/projects/archived')}
                            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                            </svg>
                            Archived
                        </button>
                    </div>
                </div>

                {view === 'folders' ? (
                    <div className="flex flex-col lg:flex-row gap-4 items-start">
                        <div className="w-full lg:w-72 shrink-0">
                            <Card padding={false}>
                                <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200 dark:border-gray-700">
                                    <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Folders</span>
                                    <Button size="sm" variant="secondary" onClick={() => setFolderModal({ mode: 'create', parent: null })}>
                                        + New Folder
                                    </Button>
                                </div>
                                <div className="p-2 max-h-[70vh] overflow-y-auto">
                                    <FolderTree
                                        folders={folders}
                                        selectedId={selectedFolder}
                                        onSelect={selectFolder}
                                        canManageAll={canManageAll}
                                        userId={auth.user?.id}
                                        onNewFolder={(parent) => setFolderModal({ mode: 'create', parent })}
                                        onRename={(folder) => setFolderModal({ mode: 'rename', folder })}
                                        onDelete={(folder) => setDeleteFolderTarget(folder)}
                                        onDropProject={handleDropProject}
                                    />
                                </div>
                            </Card>
                            <p className="mt-2 px-1 text-xs text-gray-400 dark:text-gray-500">
                                Tip: drag a project row onto a folder to move it.
                            </p>
                        </div>

                        <div className="flex-1 min-w-0 w-full">
                            {breadcrumbChain.length > 0 && (
                                <div className="flex items-center flex-wrap gap-1 mb-2 text-sm text-gray-500 dark:text-gray-400">
                                    <button className="hover:text-gray-700 dark:hover:text-gray-200" onClick={() => selectFolder('root')}>All folders</button>
                                    {breadcrumbChain.map((f) => (
                                        <span key={f.id} className="flex items-center gap-1">
                                            <svg className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                            <button
                                                className={`flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 ${String(f.id) === String(selectedFolder) ? 'font-medium text-gray-900 dark:text-gray-100' : ''}`}
                                                onClick={() => selectFolder(f.id)}
                                            >
                                                <FolderIcon folder={f} className="h-3.5 w-3.5" />
                                                {f.name}
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            {projectTable}
                        </div>
                    </div>
                ) : (
                    projectTable
                )}
            </div>

            <ConfirmModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Project"
                message={`Delete project "${deleteTarget?.name}"? This will also delete all its tasks.`}
            />

            <ConfirmModal
                isOpen={!!deleteFolderTarget}
                onClose={() => setDeleteFolderTarget(null)}
                onConfirm={handleDeleteFolder}
                title="Delete Folder"
                message={`Delete folder "${deleteFolderTarget?.name}"? Projects and subfolders inside will be moved to its parent folder — nothing will be deleted.`}
            />

            <DuplicateProjectModal
                isOpen={!!duplicateTarget}
                onClose={() => setDuplicateTarget(null)}
                project={duplicateTarget}
            />

            <MoveToFolderModal
                isOpen={!!moveTarget}
                onClose={() => setMoveTarget(null)}
                project={moveTarget}
                folders={folders}
            />

            <FolderNameModal
                isOpen={!!folderModal}
                onClose={() => { setFolderModal(null); setFolderError(null); }}
                onSubmit={submitFolderModal}
                folder={folderModal?.mode === 'rename' ? folderModal.folder : null}
                parentFolder={folderModal?.parent || null}
                processing={folderProcessing}
                error={folderError}
            />

            {toast && (
                <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-2">
                    <div className={`rounded-lg px-4 py-3 shadow-lg text-sm font-medium ${
                        toast.type === 'error'
                            ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-200 border border-red-200 dark:border-red-800'
                            : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-200 border border-green-200 dark:border-green-800'
                    }`}>
                        {toast.message}
                    </div>
                </div>
            )}
        </AuthenticatedLayout>
    );
}
