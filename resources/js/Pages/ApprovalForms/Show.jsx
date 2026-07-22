import { Head, Link } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';

export default function Show({ project, form }) {
    if (!form) {
        return (
            <AuthenticatedLayout title="Form Not Found">
                <Head title="Form Not Found" />
                <div className="text-center py-12">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Form Not Found</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">The form you're looking for doesn't exist.</p>
                    <Link href={route('approval-projects.forms.index', project.id)}>
                        <Button>Back to Forms</Button>
                    </Link>
                </div>
            </AuthenticatedLayout>
        );
    }

    return (
        <AuthenticatedLayout title={form.name}>
            <Head title={form.name} />
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={route('approval-projects.forms.index', project.id)} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                            <span className="inline-flex items-center gap-1"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>Back</span>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{form.name}</h1>
                            {form.description && (
                                <p className="text-gray-600 dark:text-gray-400 mt-1">{form.description}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Link href={route('approval-projects.forms.edit', [project.id, form.id])}>
                            <Button>Edit</Button>
                        </Link>
                        <a
                            href={form.public_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 font-medium rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition"
                        >
                            View Public Link
                        </a>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</p>
                        <p className="text-2xl font-bold mt-2 dark:text-white">
                            {form.is_active ? (
                                <span className="text-green-600">Active</span>
                            ) : (
                                <span className="text-gray-600">Inactive</span>
                            )}
                        </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Fields</p>
                        <p className="text-2xl font-bold mt-2 dark:text-white">{form.fields_count || 0}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Submissions</p>
                        <p className="text-2xl font-bold mt-2 dark:text-white">{form.submissions_count || 0}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</p>
                        <p className="text-sm font-medium mt-2 dark:text-white">
                            {new Date(form.created_at).toLocaleDateString()}
                        </p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Form Details</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Description
                            </label>
                            <p className="text-gray-600 dark:text-gray-400">
                                {form.description || 'No description provided'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Submit Button Text
                            </label>
                            <p className="text-gray-600 dark:text-gray-400">{form.submit_button_text}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Success Message
                            </label>
                            <p className="text-gray-600 dark:text-gray-400">{form.success_message}</p>
                        </div>
                    </div>
                </div>

                {form.fields && form.fields.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            Fields ({form.fields.length})
                        </h2>
                        <div className="space-y-3">
                            {form.fields.map((field) => (
                                <div
                                    key={field.id}
                                    className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                                >
                                    <div className="flex-1">
                                        <p className="font-medium text-gray-900 dark:text-white">{field.label}</p>
                                        <div className="flex gap-2 mt-1">
                                            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                                                {field.type}
                                            </span>
                                            {field.is_required && (
                                                <span className="text-xs bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 px-2 py-1 rounded">
                                                    Required
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex gap-2 justify-end">
                    <Link href={route('approval-projects.forms.index', project.id)}>
                        <Button variant="secondary">Done</Button>
                    </Link>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
