import { Head, useForm, Link } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';

export default function Edit({ project }) {
    const { data, setData, put, processing, errors } = useForm({
        name: project.name || '',
        description: project.description || '',
        status: project.status || 'active',
        owner_id: project.owner_id || '',
        due_date: project.due_date || '',
        is_pinned: project.is_pinned || false,
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        put(route('approval-projects.update', project.id));
    };

    return (
        <AuthenticatedLayout title={`Edit ${project.name}`}>
            <Head title={`Edit ${project.name}`} />
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link href={route('approval-projects.show', project.id)} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                        ← Back
                    </Link>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Edit Approval Project</h1>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-2xl">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Project Name *
                            </label>
                            <input
                                type="text"
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                                className={`w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                                    errors.name ? 'border-red-500' : 'border-gray-300'
                                }`}
                                placeholder="e.g. Expense Approval"
                                required
                            />
                            {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Description
                            </label>
                            <textarea
                                value={data.description}
                                onChange={(e) => setData('description', e.target.value)}
                                rows="4"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                placeholder="Optional description"
                            />
                            {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Status
                                </label>
                                <select
                                    value={data.status}
                                    onChange={(e) => setData('status', e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                >
                                    <option value="active">Active</option>
                                    <option value="on_hold">On Hold</option>
                                    <option value="completed">Completed</option>
                                    <option value="archived">Archived</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Due Date
                                </label>
                                <input
                                    type="date"
                                    value={data.due_date}
                                    onChange={(e) => setData('due_date', e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="is_pinned"
                                checked={data.is_pinned}
                                onChange={(e) => setData('is_pinned', e.target.checked)}
                                className="rounded dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="is_pinned" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Pin this project
                            </label>
                        </div>

                        <div className="flex gap-2 pt-4">
                            <Button type="submit" disabled={processing} processing={processing} processingText="Updating...">
                                Update Project
                            </Button>
                            <Link href={route('approval-projects.show', project.id)}>
                                <Button variant="secondary">Cancel</Button>
                            </Link>
                        </div>
                    </form>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
