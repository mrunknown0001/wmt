import { Head, Link, usePage, router } from '@inertiajs/react';
import { useState, useEffect } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';
import ApprovalItemComments from '../../Components/ApprovalItemComments';

const statusColors = {
    pending: 'bg-gray-100 text-gray-800',
    changes_requested: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
};

const capitalizeStatus = (status) => {
    if (!status) return '';
    return status
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

export default function Show({ item, project, canDecide, canEdit, auth }) {
    const [isDeciding, setIsDeciding] = useState(false);
    const [decisionComment, setDecisionComment] = useState('');
    const [decidingAction, setDecidingAction] = useState(null);

    // Custom fields: definitions from the project, values keyed by field id.
    // (Eloquent serialises these relations in snake_case.)
    const customFields = project?.custom_fields ?? [];
    const valuesByFieldId = Object.fromEntries(
        (item.custom_field_values ?? []).map((cfv) => [cfv.approval_custom_field_id, cfv])
    );

    // The list's filters/sort, carried in via the ?back= param. Reused for the
    // "← Back" link and for returning here after a decision.
    const { url: pageUrl } = usePage();
    const backQuery = (() => {
        const qIndex = pageUrl.indexOf('?');
        return qIndex === -1 ? '' : (new URLSearchParams(pageUrl.slice(qIndex + 1)).get('back') || '');
    })();
    // `back` may be either a local return path (e.g. "/my-requests?status=pending",
    // used by the requestor view) or a bare query string appended to the approval
    // project's request list (used by the approver view). "//host" is rejected so a
    // crafted ?back= can't turn this into an off-site redirect.
    const isLocalPath = backQuery.startsWith('/') && !backQuery.startsWith('//');
    const backHref = isLocalPath
        ? backQuery
        : route('approval-projects.items.index', project.id) + (backQuery.startsWith('?') ? backQuery : '');

    useEffect(() => {
        console.log('Route helper available:', typeof window.route !== 'undefined');
        console.log('Item:', item);
        console.log('Project:', project);
    }, []);

    const handleDecision = (action) => {
        if (!decidingAction) {
            setDecidingAction(action);
            return;
        }

        // Build the URL manually if route() is not available
        const url = `/approval-projects/${project.id}/items/${item.id}/advance`;
        console.log('Decision URL:', url);
        console.log('Project ID:', project.id);
        console.log('Item ID:', item.id);

        router.post(
            url,
            {
                action: decidingAction,
                comment: decisionComment,
                back: backQuery, // return to the filtered list the approver came from
            },
            {
                onStart: () => setIsDeciding(true),
                onFinish: () => setIsDeciding(false),
            }
        );
    };

    // The step in play is the *active* instance — not step_instances[0], which stays
    // on step 1 forever and made the card (and the decision panel) go stale as soon
    // as step 1 was decided. Falls back to the furthest step reached once finished.
    const stepInstances = item.step_instances ?? [];
    const currentStep = stepInstances.find((si) => si.status === 'active')
        ?? [...stepInstances].sort((a, b) => (b.step_number ?? 0) - (a.step_number ?? 0))[0];
    const isActiveStep = currentStep?.status === 'active';
    const isUserApprover = isActiveStep && !!auth.user?.can_approve && currentStep.approvers?.some(a => a.user_id === auth.user.id);

    return (
        <AuthenticatedLayout title={item.id}>
            <Head title={`Approval Request #${item.id}`} />
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href={backHref}
                            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        >
                            <span className="inline-flex items-center gap-1"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>Back</span>
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
                        <span className="font-medium">{capitalizeStatus(item.status)}</span>
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

                        {/* Attachments */}
                        {item.attachments && item.attachments.length > 0 && (
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Attachments</h2>
                                <div className="space-y-2">
                                    {item.attachments.map((attachment) => (
                                        <div key={attachment.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded">
                                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                                                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M8 16.5a1 1 0 01-1-1v-5h-3V9.5a3 3 0 013-3h1V5a1 1 0 011-1h2a1 1 0 011 1v1h1a3 3 0 013 3v1.5h-3v5a1 1 0 11-2 0v-5H8v5a1 1 0 01-1 1zm6-11H9.5V5h4.5v.5z" clipRule="evenodd" />
                                                </svg>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                        {attachment.file_name}
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        {(attachment.file_size / 1024 / 1024).toFixed(2)} MB
                                                    </p>
                                                </div>
                                            </div>
                                            <a
                                                href={attachment.url}
                                                download={attachment.file_name}
                                                className="ml-4 inline-flex items-center px-3 py-1 rounded text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-800 transition flex-shrink-0"
                                            >
                                                Download
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Custom Fields — driven by the project's field definitions so a
                            field added after submission still appears (as "—"). */}
                        {customFields.length > 0 && (
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Additional Information</h2>
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {customFields.map((field) => {
                                        const cfv = valuesByFieldId[field.id];
                                        const display = cfv?.display_value;
                                        return (
                                            <div key={field.id}>
                                                <dt className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                    {field.name}
                                                </dt>
                                                <dd className={`mt-1 whitespace-pre-wrap break-words ${
                                                    display ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
                                                }`}>
                                                    {display || '—'}
                                                </dd>
                                            </div>
                                        );
                                    })}
                                </dl>
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
                                                    {capitalizeStatus(instance.status)}
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
                                                                    {capitalizeStatus(decision.decision)}
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
                                                {capitalizeStatus(currentStep.status)}
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
                                                        className={`flex-1 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50 ${
                                                            decidingAction === 'approved'
                                                                ? 'bg-green-600 hover:bg-green-700'
                                                                : 'bg-red-600 hover:bg-red-700'
                                                        }`}
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

                        {/* Comments & Activity */}
                        <ApprovalItemComments
                            project={project}
                            item={item}
                            comments={item.comments}
                            auth={auth}
                        />
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
