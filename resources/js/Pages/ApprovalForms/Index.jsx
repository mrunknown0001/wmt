import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';

export default function Index({ project, forms }) {
    const handleDelete = (form) => {
        if (confirm(`Delete the form "${form.name}"?`)) {
            router.delete(route('approval-projects.forms.destroy', [project.id, form.id]), {
                onSuccess: () => {
                    // Page will be updated by Inertia automatically
                },
            });
        }
    };

    return (
        <AuthenticatedLayout title="Approval Forms">
            <Head title="Approval Forms" />
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={route('approval-projects.show', project.id)} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                            ← Back
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Approval Forms</h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-1">{project.name}</p>
                        </div>
                    </div>
                    <Link href={route('approval-projects.forms.create', project.id)}>
                        <Button>Create Form</Button>
                    </Link>
                </div>

                {forms && forms.length > 0 ? (
                    <div className="space-y-4">
                        {forms.map((form) => (
                            <div key={form.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{form.name}</h3>
                                        {form.description && (
                                            <p className="text-gray-600 dark:text-gray-400 mt-1">{form.description}</p>
                                        )}
                                    </div>
                                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                                        form.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                    }`}>
                                        {form.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </div>

                                <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                                    {form.fields_count || 0} fields • {form.submissions_count || 0} submissions
                                </div>

                                <div className="flex items-center gap-2">
                                    <a
                                        href={form.public_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="relative group inline-flex items-center justify-center w-8 h-8 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                                        title="View Public Form"
                                    >
                                        🔗
                                        <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                            View Public Form
                                        </span>
                                    </a>
                                    <Link
                                        href={route('approval-projects.forms.edit', [project.id, form.id])}
                                        className="relative group inline-flex items-center justify-center w-8 h-8 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition"
                                        title="Edit"
                                    >
                                        ✎
                                        <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                            Edit
                                        </span>
                                    </Link>
                                    <button
                                        onClick={() => handleDelete(form)}
                                        className="relative group inline-flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition"
                                        title="Delete"
                                    >
                                        🗑️
                                        <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                            Delete
                                        </span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <p className="text-gray-600 dark:text-gray-400 mb-4">No forms yet</p>
                        <Link href={route('approval-projects.forms.create', project.id)}>
                            <Button>Create Your First Form</Button>
                        </Link>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
