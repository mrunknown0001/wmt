import { Head, useForm, Link } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';
import UserMultiSelect from '../../Components/UserMultiSelect';
import SeriesNumberConfig from '../../Components/SeriesNumberConfig';

export default function Edit({ project, users = [] }) {
    const { data, setData, put, processing, errors } = useForm({
        name: project.name || '',
        description: project.description || '',
        status: project.status || 'active',
        owner_id: project.owner_id || '',
        co_owner_ids: (project.members || [])
            .filter((m) => m.pivot?.role === 'co-owner')
            .map((m) => m.id),
        is_pinned: project.is_pinned || false,
        series_prefix: project.series_prefix || '',
        series_padding: project.series_padding ?? 5,
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
                        <span className="inline-flex items-center gap-1"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>Back</span>
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

                        <SeriesNumberConfig
                            prefix={data.series_prefix}
                            padding={data.series_padding}
                            onPrefixChange={(v) => setData('series_prefix', v)}
                            onPaddingChange={(v) => setData('series_padding', v)}
                            locked={!!project.series_prefix}
                            nextSequence={project.series_next ?? 1}
                            errors={errors}
                        />

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
