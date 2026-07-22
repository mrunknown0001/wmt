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

export default function Edit({ project, rule, customFields }) {
    const { data, setData, put, processing, errors } = useForm({
        name: rule.name,
        is_active: rule.is_active,
        trigger_type: rule.trigger_type,
        trigger_config: rule.trigger_config || {},
        conditions: rule.conditions || null,
        actions: rule.actions || [],
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        put(route('approval-projects.automation-rules.update', [project.id, rule.id]), {
            onFinish: () => setIsSubmitting(false),
        });
    };

    return (
        <AuthenticatedLayout title="Edit Automation Rule">
            <Head title="Edit Automation Rule" />
            <div className="space-y-6 max-w-4xl">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Edit Automation Rule</h1>
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
                        />
                        {errors.actions && <p className="text-red-600 text-sm mt-2">{errors.actions}</p>}
                    </div>

                    {/* Form Actions */}
                    <div className="flex gap-4">
                        <Button type="submit" disabled={processing || isSubmitting}>
                            {isSubmitting ? 'Saving...' : 'Save Changes'}
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
