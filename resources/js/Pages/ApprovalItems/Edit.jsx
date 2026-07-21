import { Head, Link, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';

export default function Edit({ project, item }) {
    const { data, setData, put, processing, errors } = useForm({
        title: item.title || '',
        description: item.description || '',
        customFieldValues: {},
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        put(route('approval-projects.items.update', [project.id, item.id]));
    };

    return (
        <AuthenticatedLayout title="Edit Approval Request">
            <Head title="Edit Approval Request" />
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link href={route('approval-projects.items.show', [project.id, item.id])} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                        ← Back
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Edit Approval Request</h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">{project.name}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 max-w-2xl">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Title *
                            </label>
                            <input
                                type="text"
                                value={data.title}
                                onChange={(e) => setData('title', e.target.value)}
                                className={`w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                                    errors.title ? 'border-red-500' : 'border-gray-300'
                                }`}
                                placeholder="Enter request title"
                                required
                            />
                            {errors.title && <p className="text-red-600 text-sm mt-1">{errors.title}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Description
                            </label>
                            <textarea
                                value={data.description}
                                onChange={(e) => setData('description', e.target.value)}
                                rows="6"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                placeholder="Enter request description"
                            />
                            {errors.description && <p className="text-red-600 text-sm mt-1">{errors.description}</p>}
                        </div>

                        <div className="flex gap-4 pt-4">
                            <Button type="submit" disabled={processing}>
                                {processing ? 'Updating...' : 'Update Request'}
                            </Button>
                            <Link href={route('approval-projects.items.show', [project.id, item.id])}>
                                <Button variant="secondary">Cancel</Button>
                            </Link>
                        </div>
                    </form>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
