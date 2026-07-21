import { Head, Link, usePage, router } from '@inertiajs/react';
import { useState } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';

const CheckIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);

export default function Index({ project, items, auth }) {
    const [approvingItemId, setApprovingItemId] = useState(null);

    const getStatusColor = (status) => {
        const colors = {
            pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
            approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
            rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
            changes_requested: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
            cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
        };
        return colors[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    };

    const isUserApprover = (item) => {
        if (item.status !== 'pending') return false;
        const activeStep = item.step_instances?.find(s => s.status === 'active');
        if (!activeStep) return false;
        return activeStep.approvers?.some(a => a.user_id === auth.user.id);
    };

    const handleApprove = (item) => {
        router.post(
            `/approval-projects/${project.id}/items/${item.id}/advance`,
            {
                action: 'approved',
                comment: '',
            },
            {
                onFinish: () => setApprovingItemId(null),
            }
        );
    };

    return (
        <AuthenticatedLayout title={`Items - ${project.name}`}>
            <Head title={`Items - ${project.name}`} />
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={route('approval-projects.show', project.id)} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                            ← Back
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Approval Requests</h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-1">{project.name}</p>
                        </div>
                    </div>
                    <Link href={route('approval-projects.items.create', project.id)}>
                        <Button>New Request</Button>
                    </Link>
                </div>

                {items.data && items.data.length > 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Title</th>
                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Requester</th>
                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Status</th>
                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Chain</th>
                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Created</th>
                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {items.data.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                                        <td className="px-6 py-4">
                                            <p className="font-medium text-gray-900 dark:text-white">{item.title || 'Untitled'}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-gray-700 dark:text-gray-300">{item.requester?.name || 'Unknown'}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                                                {item.status.replace('_', ' ').charAt(0).toUpperCase() + item.status.replace('_', ' ').slice(1)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-gray-700 dark:text-gray-300">{item.chain_version?.chain?.name || 'N/A'}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                {new Date(item.created_at).toLocaleDateString()}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex gap-2">
                                                {isUserApprover(item) && (
                                                    <button
                                                        onClick={() => setApprovingItemId(item.id)}
                                                        className="inline-flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition"
                                                    >
                                                        <CheckIcon />
                                                        Approve
                                                    </button>
                                                )}
                                                <Link href={route('approval-projects.items.show', [project.id, item.id])}>
                                                    <Button size="sm" variant="secondary">View</Button>
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <p className="text-gray-600 dark:text-gray-400 mb-4">No approval requests yet</p>
                        <Link href={route('approval-projects.items.create', project.id)}>
                            <Button>Create Your First Request</Button>
                        </Link>
                    </div>
                )}

                {/* Approve Confirmation Modal */}
                {approvingItemId && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-sm mx-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                Approve Request
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                Are you sure you want to approve this approval request?
                            </p>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setApprovingItemId(null)}
                                    className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-900 font-medium rounded-lg transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        const item = items.data.find(i => i.id === approvingItemId);
                                        if (item) handleApprove(item);
                                    }}
                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition"
                                >
                                    Approve
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
