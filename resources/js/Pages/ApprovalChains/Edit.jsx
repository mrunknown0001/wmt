import { Head, Link, useForm } from '@inertiajs/react';
import { useState } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';
import ApprovalChainBuilder from '../../Components/ApprovalChainBuilder';

const REJECT_BEHAVIORS = {
    reject_item: 'Reject (Terminal)',
    return_to_previous_step: 'Return to Previous Step',
    return_to_requester: 'Return to Requester',
};

export default function Edit({ project, chain, currentVersion, users, roles, inFlightItems = [] }) {
    const { data, setData, put, processing, errors } = useForm({
        name: chain.name,
        description: chain.description,
        is_active: chain.is_active,
        is_default: chain.is_default,
        priority: chain.priority,
        on_reject_behavior: chain.on_reject_behavior,
        selector_conditions: chain.selector_conditions,
        steps: currentVersion?.steps || [],
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        put(route('approval-projects.chains.update', [project.id, chain.id]), {
            onFinish: () => setIsSubmitting(false),
        });
    };

    return (
        <AuthenticatedLayout title="Edit Approval Chain">
            <Head title="Edit Approval Chain" />
            <div className="space-y-6 max-w-4xl">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Edit Approval Chain</h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">{project.name}</p>
                    </div>
                    <Link href={route('approval-projects.chains.index', project.id)}>
                        <Button variant="secondary">Cancel</Button>
                    </Link>
                </div>

                {inFlightItems.length > 0 && (
                    <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                        <p className="text-yellow-800 dark:text-yellow-200">
                            ⚠️ This chain has {inFlightItems.length} approval(s) in progress. Saving changes will create a new version to protect in-flight items.
                        </p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Info */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Chain Details</h2>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Name *
                            </label>
                            <input
                                type="text"
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                required
                            />
                            {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Description
                            </label>
                            <textarea
                                value={data.description}
                                onChange={(e) => setData('description', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                rows="3"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Priority
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={data.priority}
                                    onChange={(e) => setData('priority', parseInt(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                />
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Lower = higher priority</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Default Reject Behavior
                                </label>
                                <select
                                    value={data.on_reject_behavior}
                                    onChange={(e) => setData('on_reject_behavior', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                >
                                    {Object.entries(REJECT_BEHAVIORS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={data.is_active}
                                    onChange={(e) => setData('is_active', e.target.checked)}
                                    className="rounded"
                                />
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</span>
                            </label>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={data.is_default}
                                    onChange={(e) => setData('is_default', e.target.checked)}
                                    className="rounded"
                                />
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Set as Default</span>
                            </label>
                        </div>
                    </div>

                    {/* Steps Builder */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <ApprovalChainBuilder
                            value={data.steps}
                            onChange={(steps) => setData('steps', steps)}
                            users={users}
                            roles={roles}
                        />
                        {errors.steps && <p className="text-red-600 text-sm mt-2">{errors.steps}</p>}
                    </div>

                    {/* Form Actions */}
                    <div className="flex gap-4">
                        <Button type="submit" disabled={processing || isSubmitting}>
                            {isSubmitting ? 'Saving...' : 'Save Changes'}
                        </Button>
                        <Link href={route('approval-projects.chains.index', project.id)}>
                            <Button variant="secondary">Cancel</Button>
                        </Link>
                    </div>
                </form>
            </div>
        </AuthenticatedLayout>
    );
}
