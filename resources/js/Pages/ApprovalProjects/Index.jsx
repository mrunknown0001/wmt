import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';

const EditIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
);

const TrashIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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

const ArchiveIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
);

export default function Index({ projects, archivedCount = 0, trashedCount = 0 }) {
    const handleDelete = (id) => {
        if (confirm('Move this approval project to Trash? Its pending items will be hidden from approvers. You can restore it, or delete it permanently from the Trash.')) {
            router.delete(route('approval-projects.destroy', id));
        }
    };

    const handleArchive = (project) => {
        if (confirm(`Archive "${project.name}"? It will be hidden from the active list.`)) {
            router.patch(route('approval-projects.archive', project.id), {}, { preserveScroll: true });
        }
    };

    return (
        <AuthenticatedLayout title="Approval Projects">
            <Head title="Approval Projects" />
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Approval Projects</h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">Manage approval workflows and requests</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {archivedCount > 0 && (
                            <Link
                                href={route('approval-projects.archived')}
                                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                            >
                                Archived ({archivedCount})
                            </Link>
                        )}
                        {trashedCount > 0 && (
                            <Link
                                href={route('approval-projects.trash')}
                                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                            >
                                Trash ({trashedCount})
                            </Link>
                        )}
                        <Link href={route('approval-projects.create')}>
                            <Button>Create Approval Project</Button>
                        </Link>
                    </div>
                </div>

                {projects.data.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
                        <p className="text-gray-600 dark:text-gray-400 mb-4">No approval projects yet</p>
                        <Link href={route('approval-projects.create')}>
                            <Button>Create your first approval project</Button>
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {projects.data.map((project) => (
                            <div key={project.id} className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <Link href={route('approval-projects.show', project.id)}>
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">
                                                {project.name}
                                            </h3>
                                        </Link>
                                        {project.description && (
                                            <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{project.description}</p>
                                        )}
                                        <div className="flex items-center gap-4 mt-3 text-sm">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                project.status === 'active'
                                                    ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100'
                                                    : project.status === 'on_hold'
                                                    ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100'
                                            }`}>
                                                {project.status.replace('_', ' ').charAt(0).toUpperCase() + project.status.replace('_', ' ').slice(1)}
                                            </span>
                                            {project.owner && (
                                                <span className="text-gray-600 dark:text-gray-400">Owner: {project.owner.name}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 ml-4">
                                        <Tooltip content="Edit">
                                            <Link href={route('approval-projects.edit', project.id)}>
                                                <button className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                                                    <EditIcon />
                                                </button>
                                            </Link>
                                        </Tooltip>
                                        <Tooltip content="Archive">
                                            <button
                                                onClick={() => handleArchive(project)}
                                                className="p-1.5 text-gray-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                                            >
                                                <ArchiveIcon />
                                            </button>
                                        </Tooltip>
                                        <Tooltip content="Delete">
                                            <button
                                                onClick={() => handleDelete(project.id)}
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
