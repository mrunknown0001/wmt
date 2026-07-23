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

export default function Create({ project, users, roles, departments = [], divisions = [], teams = [] }) {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        description: '',
        is_active: true,
        is_default: false,
        priority: 1,
        on_reject_behavior: 'reject_item',
        selector_conditions: null,
        steps: [],
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate that at least one step exists
        if (!data.steps || data.steps.length === 0) {
            alert('Please add at least one approval step to the chain');
            return;
        }

        // Validate that all steps have required fields
        for (let i = 0; i < data.steps.length; i++) {
            const step = data.steps[i];
            if (!step.name || step.name.trim() === '') {
                alert(`Step ${i + 1}: Step name is required`);
                return;
            }
            if (!step.approver_type) {
                alert(`Step ${i + 1}: Approver type is required`);
                return;
            }
            if (step.approver_type === 'specific_user' && !step.approver_config?.user_id) {
                alert(`Step ${i + 1}: Please select a user for this step`);
                return;
            }
        }

        setIsSubmitting(true);
        post(route('approval-projects.chains.store', project.id), {
            onFinish: () => setIsSubmitting(false),
        });
    };

    return (
        <AuthenticatedLayout title="Create Approval Chain">
            <Head title="Create Approval Chain" />
            <div className="space-y-6 max-w-4xl">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create Approval Chain</h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">{project.name}</p>
                    </div>
                    <Link href={route('approval-projects.chains.index', project.id)}>
                        <Button variant="secondary">Cancel</Button>
                    </Link>
                </div>

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
                            departments={departments}
                            divisions={divisions}
                            teams={teams}
                        />
                        {errors.steps && (
                            <div className="text-red-600 text-sm mt-2 bg-red-50 dark:bg-red-900/20 p-3 rounded">
                                <p className="font-semibold">Error with steps:</p>
                                <p>{errors.steps}</p>
                            </div>
                        )}
                        {Object.keys(errors).map((key) => (
                            key.startsWith('steps.') && (
                                <div key={key} className="text-red-600 text-sm mt-2 bg-red-50 dark:bg-red-900/20 p-3 rounded">
                                    <p>{key}: {errors[key]}</p>
                                </div>
                            )
                        ))}
                    </div>

                    {/* Form Actions */}
                    <div className="flex gap-4">
                        <Button type="submit" disabled={processing || isSubmitting}>
                            {isSubmitting ? 'Creating...' : 'Create Chain'}
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
