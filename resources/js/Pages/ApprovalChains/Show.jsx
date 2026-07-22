import { Head, Link } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';

const APPROVER_TYPES = {
    specific_user: 'Specific User',
    role: 'Role',
    requester_manager: 'Requester\'s Manager',
    department_head: 'Department Head',
    division_head: 'Division Head',
    team_leader: 'Team Leader',
    group: 'Group',
    project_owner: 'Project Owner',
};

const QUORUM_MODES = {
    any: 'Any Approver',
    all: 'All Approvers',
    majority: 'Majority',
    count: 'Specific Count',
};

const REJECT_BEHAVIORS = {
    reject_item: 'Reject (Terminal)',
    return_to_previous_step: 'Return to Previous Step',
    return_to_requester: 'Return to Requester',
};

export default function Show({ project, chain, currentVersion }) {
    // Debug logging
    console.log('Show page received:', {
        chain: chain?.id,
        currentVersion: currentVersion?.id,
        steps: currentVersion?.steps?.length
    });

    return (
        <AuthenticatedLayout title={chain.name}>
            <Head title={chain.name} />
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={route('approval-projects.chains.index', project.id)} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                            <span className="inline-flex items-center gap-1"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>Back</span>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{chain.name}</h1>
                            {chain.description && (
                                <p className="text-gray-600 dark:text-gray-400 mt-1">{chain.description}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Link href={route('approval-projects.chains.edit', [project.id, chain.id])}>
                            <Button>Edit</Button>
                        </Link>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</h3>
                        <div className="flex items-center gap-2 mt-2">
                            <span className={`inline-block w-2 h-2 rounded-full ${chain.is_active ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">{chain.is_active ? 'Active' : 'Inactive'}</p>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Priority</h3>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white mt-2">{chain.priority}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Default Chain</h3>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white mt-2">{chain.is_default ? 'Yes' : 'No'}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Approval Steps</h2>

                    {currentVersion && currentVersion.steps && currentVersion.steps.length > 0 ? (
                        <div className="space-y-4">
                            {currentVersion.steps.map((step, index) => (
                                <div key={step.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                    <div className="flex items-start justify-between mb-4">
                                        <div>
                                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                                Step {step.step_number}: {step.name || 'Unnamed'}
                                            </h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                                {APPROVER_TYPES[step.approver_type] || step.approver_type}
                                            </p>
                                        </div>
                                        <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded text-xs font-medium">
                                            {QUORUM_MODES[step.quorum_mode] || step.quorum_mode}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <p className="text-gray-600 dark:text-gray-400">Quorum Mode</p>
                                            <p className="font-medium text-gray-900 dark:text-white">{QUORUM_MODES[step.quorum_mode]}</p>
                                        </div>
                                        {step.quorum_mode === 'count' && (
                                            <div>
                                                <p className="text-gray-600 dark:text-gray-400">Required Count</p>
                                                <p className="font-medium text-gray-900 dark:text-white">{step.quorum_count}</p>
                                            </div>
                                        )}
                                        {step.on_reject_override && (
                                            <div>
                                                <p className="text-gray-600 dark:text-gray-400">On Reject</p>
                                                <p className="font-medium text-gray-900 dark:text-white">{REJECT_BEHAVIORS[step.on_reject_override]}</p>
                                            </div>
                                        )}
                                        {step.fallback_user_id && (
                                            <div>
                                                <p className="text-gray-600 dark:text-gray-400">Fallback User</p>
                                                <p className="font-medium text-gray-900 dark:text-white">ID: {step.fallback_user_id}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-600 dark:text-gray-400">No steps configured yet</p>
                    )}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Default Reject Behavior</h2>
                    <p className="text-gray-900 dark:text-white font-medium">{REJECT_BEHAVIORS[chain.on_reject_behavior] || chain.on_reject_behavior}</p>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
