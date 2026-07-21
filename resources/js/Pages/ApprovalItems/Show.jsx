import { Head, Link, usePage } from '@inertiajs/react';
import { useState } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';
import CustomFieldValueEditor from '../../Components/CustomFieldValueEditor';

const statusColors = {
    pending: 'bg-gray-100 text-gray-800',
    changes_requested: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
};


export default function Show({ item, project, canDecide, canEdit, auth }) {
    const [isDeciding, setIsDeciding] = useState(false);
    const [decisionComment, setDecisionComment] = useState('');
    const [decidingAction, setDecidingAction] = useState(null);

    const handleDecision = async (action) => {
        if (!decidingAction) {
            setDecidingAction(action);
            return;
        }

        setIsDeciding(true);
        try {
            const response = await fetch(
                route('approval-projects.items.advance', [project.id, item.id]),
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content,
                    },
                    body: JSON.stringify({
                        action: decidingAction,
                        comment: decisionComment,
                    }),
                }
            );

            if (response.ok) {
                window.location.reload();
            }
        } catch (error) {
            console.error('Error making decision:', error);
        } finally {
            setIsDeciding(false);
        }
    };

    const currentStep = item.step_instances?.[0];
    const isActiveStep = currentStep?.status === 'active';
    const isUserApprover = isActiveStep && currentStep.approvers?.some(a => a.user_id === auth.user.id);

    return (
        <AuthenticatedLayout title={item.id}>
            <Head title={`Approval Request #${item.id}`} />
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href={route('approval-projects.show', project.id)}
                            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        >
                            ← Back
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                                Approval Request
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400">
                                {project.name} • Submitted {new Date(item.submitted_at).toLocaleDateString()}
                            </p>
                        </div>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${statusColors[item.status]}`}>
                        <span className="font-medium">{item.status.replace('_', ' ').charAt(0).toUpperCase() + item.status.replace('_', ' ').slice(1)}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Request Details */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Request Details</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Requested By</label>
                                    <p className="mt-1 text-gray-900 dark:text-white">{item.requester?.name}</p>
                                </div>
                                {item.title && (
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
                                        <p className="mt-1 text-gray-900 dark:text-white">{item.title}</p>
                                    </div>
                                )}
                                {item.description && (
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                                        <p className="mt-1 text-gray-900 dark:text-white whitespace-pre-wrap">{item.description}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Custom Fields */}
                        {item.custom_field_values && item.custom_field_values.length > 0 && (
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Additional Information</h2>
                                <div className="space-y-4">
                                    {item.custom_field_values.map((cfv) => (
                                        <div key={cfv.id}>
                                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                {cfv.custom_field?.name}
                                            </label>
                                            <p className="mt-1 text-gray-900 dark:text-white">
                                                {cfv.value}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Approval History & Audit Trail */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Approval History</h2>
                            {item.step_instances && item.step_instances.length > 0 ? (
                                <div className="space-y-6">
                                    {item.step_instances.map((instance, idx) => (
                                        <div key={instance.id} className="border-l-4 border-gray-200 dark:border-gray-700 pl-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                                    Step {instance.step_number}: {instance.step?.name}
                                                </h3>
                                                <span className={`text-xs px-2 py-1 rounded font-medium ${
                                                    instance.status === 'active' ? 'bg-blue-100 text-blue-800' :
                                                    instance.status === 'approved' ? 'bg-green-100 text-green-800' :
                                                    instance.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                                    'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {instance.status}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                                Activated {new Date(instance.activated_at).toLocaleString()}
                                                {instance.completed_at && ` • Completed ${new Date(instance.completed_at).toLocaleString()}`}
                                            </p>

                                            {/* Approvers */}
                                            <div className="mb-4">
                                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Approvers:</p>
                                                <div className="space-y-2">
                                                    {instance.approvers?.map((approver) => {
                                                        const decision = instance.decisions?.find(d => d.decided_by === approver.user_id);
                                                        return (
                                                            <div key={approver.id} className="flex items-center justify-between text-sm">
                                                                <span className="text-gray-700 dark:text-gray-300">{approver.user?.name}</span>
                                                                {decision ? (
                                                                    <span className={`font-medium ${
                                                                        decision.decision === 'approved' ? 'text-green-600' : 'text-red-600'
                                                                    }`}>
                                                                        {decision.decision}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-yellow-600">Pending</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Decisions */}
                                            {instance.decisions && instance.decisions.length > 0 && (
                                                <div className="space-y-2 text-sm">
                                                    {instance.decisions.map((decision) => (
                                                        <div key={decision.id} className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="font-medium text-gray-900 dark:text-white">
                                                                    {decision.decided_by_user?.name}
                                                                </span>
                                                                <span className={`text-xs font-medium ${
                                                                    decision.decision === 'approved' ? 'text-green-600' : 'text-red-600'
                                                                }`}>
                                                                    {decision.decision}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                                                {new Date(decision.decided_at).toLocaleString()}
                                                            </p>
                                                            {decision.comment && (
                                                                <p className="text-gray-700 dark:text-gray-300 mt-2">{decision.comment}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-600 dark:text-gray-400">No approval history yet</p>
                            )}
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Current Step Info */}
                        {currentStep && (
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Current Step</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Step</label>
                                        <p className="mt-1 text-gray-900 dark:text-white">{currentStep.step?.name}</p>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                                        <p className="mt-1">
                                            <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                                currentStep.status === 'active' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                                            }`}>
                                                {currentStep.status}
                                            </span>
                                        </p>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Quorum Required</label>
                                        <p className="mt-1 text-gray-900 dark:text-white">{currentStep.quorum_required} approval(s)</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Decision Panel */}
                        {canDecide && isUserApprover && isActiveStep && item.status === 'pending' && (
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Your Decision</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Comment (optional)
                                        </label>
                                        <textarea
                                            value={decisionComment}
                                            onChange={(e) => setDecisionComment(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                            rows="4"
                                            placeholder="Add a comment to explain your decision..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        {!decidingAction ? (
                                            <>
                                                <button
                                                    onClick={() => setDecidingAction('approved')}
                                                    className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition"
                                                >
                                                    Approve
                                                </button>
                                                <button
                                                    onClick={() => setDecidingAction('rejected')}
                                                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition"
                                                >
                                                    Reject
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                                                    <p className="text-sm text-gray-700 dark:text-gray-300">
                                                        Are you sure you want to <span className="font-semibold">{decidingAction}</span> this request?
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleDecision(decidingAction)}
                                                        disabled={isDeciding}
                                                        className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                                                    >
                                                        {isDeciding ? 'Processing...' : 'Confirm'}
                                                    </button>
                                                    <button
                                                        onClick={() => setDecidingAction(null)}
                                                        className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-medium py-2 px-4 rounded-lg transition"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Status Summary */}
                        {(item.status === 'approved' || item.status === 'rejected' || item.status === 'cancelled') && (
                            <div className={`rounded-lg shadow p-6 ${
                                item.status === 'approved' ? 'bg-green-50 dark:bg-green-900' :
                                item.status === 'rejected' ? 'bg-red-50 dark:bg-red-900' :
                                'bg-gray-50 dark:bg-gray-900'
                            }`}>
                                <h3 className={`text-lg font-semibold mb-2 ${
                                    item.status === 'approved' ? 'text-green-900 dark:text-green-100' :
                                    item.status === 'rejected' ? 'text-red-900 dark:text-red-100' :
                                    'text-gray-900 dark:text-gray-100'
                                }`}>
                                    {item.status === 'approved' && '✓ Approved'}
                                    {item.status === 'rejected' && '✗ Rejected'}
                                    {item.status === 'cancelled' && '○ Cancelled'}
                                </h3>
                                <p className={item.status === 'approved' ? 'text-green-800 dark:text-green-200' :
                                    item.status === 'rejected' ? 'text-red-800 dark:text-red-200' :
                                    'text-gray-800 dark:text-gray-200'}>
                                    {new Date(item.decided_at).toLocaleString()}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
