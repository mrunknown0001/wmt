import { Head, Link, useForm } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';
import UserMultiSelect from '../../Components/UserMultiSelect';

export default function Create({ users = [] }) {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        description: '',
        status: 'active',
        owner_id: '',
        co_owner_ids: [],
        due_date: '',
        is_pinned: false,
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        post(route('approval-projects.store'));
    };

    return (
        <AuthenticatedLayout title="Create Approval Project">
            <Head title="Create Approval Project" />
            <div className="space-y-6">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create Approval Project</h1>

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

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Owner
                            </label>
                            <select
                                value={data.owner_id}
                                onChange={(e) => setData('owner_id', e.target.value)}
                                className={`w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                                    errors.owner_id ? 'border-red-500' : 'border-gray-300'
                                }`}
                            >
                                <option value="">— Select owner —</option>
                                {users.map((u) => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                            {errors.owner_id && <p className="text-red-500 text-sm mt-1">{errors.owner_id}</p>}
                        </div>

                        <div>
                            <UserMultiSelect
                                label="Co-owners"
                                users={users}
                                selected={data.co_owner_ids}
                                onChange={(ids) => setData('co_owner_ids', ids)}
                                excludeIds={data.owner_id ? [Number(data.owner_id)] : []}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Co-owners can manage this approval project alongside the owner.
                            </p>
                            {errors.co_owner_ids && <p className="text-red-500 text-sm mt-1">{errors.co_owner_ids}</p>}
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
                            <Button type="submit" disabled={processing} processing={processing} processingText="Creating...">
                                Create Project
                            </Button>
                            <Link href={route('approval-projects.index')}>
                                <Button variant="secondary">Cancel</Button>
                            </Link>
                        </div>
                    </form>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
