import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';

export default function Index({ projects }) {
    const handleDelete = (id) => {
        if (confirm('Are you sure? This will delete the approval project.')) {
            router.delete(route('approval-projects.destroy', id));
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
                    <Link href={route('approval-projects.create')}>
                        <Button>Create Approval Project</Button>
                    </Link>
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
                                                {project.status.replace('_', ' ')}
                                            </span>
                                            {project.owner && (
                                                <span className="text-gray-600 dark:text-gray-400">Owner: {project.owner.name}</span>
                                            )}
                                            {project.due_date && (
                                                <span className="text-gray-600 dark:text-gray-400">Due: {new Date(project.due_date).toLocaleDateString()}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 ml-4">
                                        <Link href={route('approval-projects.edit', project.id)}>
                                            <button className="text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 px-3 py-2">
                                                Edit
                                            </button>
                                        </Link>
                                        <button
                                            onClick={() => handleDelete(project.id)}
                                            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 px-3 py-2"
                                        >
                                            Delete
                                        </button>
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
