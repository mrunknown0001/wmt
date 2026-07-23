import { Head, Link, useForm } from '@inertiajs/react';
import { useState } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';
import ApprovalAutomationBuilder from '../../Components/ApprovalAutomationBuilder';

const TRIGGER_TYPES = {
    item_submitted: 'Item Submitted',
    approval_requested: 'Approval Requested',
    approval_step_decided: 'Step Decision Made',
    approval_completed: 'Approval Completed',
    approval_rejected: 'Approval Rejected',
    approval_changes_requested: 'Changes Requested',
    approval_cancelled: 'Approval Cancelled',
};

export default function Create({ project, customFields, notifyUsers = [], notifyTeams = [] }) {
    const { data, setData, post, processing, errors } = useForm({
        name: '',
        is_active: true,
        trigger_type: 'item_submitted',
        trigger_config: {},
        conditions: null,
        actions: [],
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        post(route('approval-projects.automation-rules.store', project.id), {
            onFinish: () => setIsSubmitting(false),
        });
    };

    return (
        <AuthenticatedLayout title="Create Automation Rule">
            <Head title="Create Automation Rule" />
            <div className="space-y-6 max-w-4xl">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create Automation Rule</h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">{project.name}</p>
                    </div>
                    <Link href={route('approval-projects.automation-rules.index', project.id)}>
                        <Button variant="secondary">Cancel</Button>
                    </Link>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Info */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Rule Details</h2>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Rule Name *
                            </label>
                            <input
                                type="text"
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                                placeholder="e.g., Notify department head on submission"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                required
                            />
                            {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name}</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Trigger *
                            </label>
                            <select
                                value={data.trigger_type}
                                onChange={(e) => setData('trigger_type', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                required
                            >
                                {Object.entries(TRIGGER_TYPES).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                            {errors.trigger_type && <p className="text-red-600 text-sm mt-1">{errors.trigger_type}</p>}
                        </div>

                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={data.is_active}
                                onChange={(e) => setData('is_active', e.target.checked)}
                                className="rounded"
                            />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</span>
                        </label>
                    </div>

                    {/* Automation Builder */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <ApprovalAutomationBuilder
                            conditions={data.conditions}
                            onConditionsChange={(conditions) => setData('conditions', conditions)}
                            actions={data.actions}
                            onActionsChange={(actions) => setData('actions', actions)}
                            customFields={customFields || project.custom_fields || []}
                            notifyUsers={notifyUsers}
                            notifyTeams={notifyTeams}
                        />
                        {errors.actions && <p className="text-red-600 text-sm mt-2">{errors.actions}</p>}
                    </div>

                    {/* Form Actions */}
                    <div className="flex gap-4">
                        <Button type="submit" disabled={processing || isSubmitting}>
                            {isSubmitting ? 'Creating...' : 'Create Rule'}
                        </Button>
                        <Link href={route('approval-projects.automation-rules.index', project.id)}>
                            <Button variant="secondary">Cancel</Button>
                        </Link>
                    </div>
                </form>
            </div>
        </AuthenticatedLayout>
    );
}
