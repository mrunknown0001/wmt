import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';

const RestoreIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
);

const TrashIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const Tooltip = ({ content, children }) => (
    <div className="relative group">
        {children}
        <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
            {content}
        </span>
    </div>
);

export default function Trash({ projects }) {
    const handleRestore = (project) => {
        if (confirm(`Restore "${project.name}"? Its pending items return to approvers' queues.`)) {
            router.patch(route('approval-projects.restore', project.id), {}, { preserveScroll: true });
        }
    };

    const handleForceDelete = (project) => {
        const count = project.approval_items_count ?? 0;
        const itemsNote = count > 0
            ? ` This will permanently delete ${count} ${count === 1 ? 'item' : 'items'} and all their approvals.`
            : '';
        if (confirm(`Permanently delete "${project.name}"?${itemsNote} This cannot be undone.`)) {
            router.delete(route('approval-projects.force-destroy', project.id), { preserveScroll: true });
        }
    };

    return (
        <AuthenticatedLayout title="Approval Projects — Trash">
            <Head title="Approval Projects — Trash" />
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Trash</h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">
                            Deleted approval projects. Restore them, or delete them permanently to remove all their items.
                        </p>
                    </div>
                    <Link
                        href={route('approval-projects.index')}
                        className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    >
                        ← Back to Approval Projects
                    </Link>
                </div>

                {projects.data.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
                        <p className="text-gray-600 dark:text-gray-400">Trash is empty.</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {projects.data.map((project) => (
                            <div key={project.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{project.name}</h3>
                                        {project.description && (
                                            <p className="text-gray-600 dark:text-gray-400 text-sm mt-1 truncate">{project.description}</p>
                                        )}
                                        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-600 dark:text-gray-400">
                                            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100">
                                                {project.approval_items_count ?? 0} {(project.approval_items_count ?? 0) === 1 ? 'item' : 'items'}
                                            </span>
                                            {project.owner && <span>Owner: {project.owner.name}</span>}
                                            {project.deleted_at && (
                                                <span>Deleted {new Date(project.deleted_at).toLocaleDateString()}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 ml-4">
                                        <Tooltip content="Restore">
                                            <button
                                                onClick={() => handleRestore(project)}
                                                className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                                            >
                                                <RestoreIcon />
                                            </button>
                                        </Tooltip>
                                        <Tooltip content="Delete permanently">
                                            <button
                                                onClick={() => handleForceDelete(project)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                            >
                                                <TrashIcon />
                                            </button>
                                        </Tooltip>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
