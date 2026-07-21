import { Head, Link } from '@inertiajs/react';
import { useState } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';

const statusColors = {
    pending: 'bg-yellow-50 dark:bg-yellow-900 border-l-4 border-yellow-400',
    changes_requested: 'bg-orange-50 dark:bg-orange-900 border-l-4 border-orange-400',
};

const priorityColors = {
    low: 'text-blue-600',
    medium: 'text-yellow-600',
    high: 'text-orange-600',
    urgent: 'text-red-600',
};

const priorityBadgeColors = {
    low: 'bg-blue-100 text-blue-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    urgent: 'bg-red-100 text-red-800',
};

export default function Index({ pendingApprovals, stats }) {
    const [filteredStatus, setFilteredStatus] = useState('all');

    const filtered = filteredStatus === 'all'
        ? pendingApprovals
        : pendingApprovals.filter(a => a.status === filteredStatus);

    const groupedByProject = {};
    filtered.forEach((approval) => {
        const projectId = approval.approval_project_id;
        if (!groupedByProject[projectId]) {
            groupedByProject[projectId] = {
                project: approval.approval_project,
                items: [],
            };
        }
        groupedByProject[projectId].items.push(approval);
    });

    return (
        <AuthenticatedLayout title="My Approvals">
            <Head title="My Approvals" />
            <div className="space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Approvals</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Review and approve pending requests</p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pending Approvals</p>
                                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats?.pending || 0}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Changes Requested</p>
                                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats?.changes_requested || 0}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Decided This Week</p>
                                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{stats?.decided_this_week || 0}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setFilteredStatus('all')}
                        className={`px-4 py-2 rounded-lg font-medium transition ${
                            filteredStatus === 'all'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilteredStatus('pending')}
                        className={`px-4 py-2 rounded-lg font-medium transition ${
                            filteredStatus === 'pending'
                                ? 'bg-yellow-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                        Pending ({stats?.pending || 0})
                    </button>
                    <button
                        onClick={() => setFilteredStatus('changes_requested')}
                        className={`px-4 py-2 rounded-lg font-medium transition ${
                            filteredStatus === 'changes_requested'
                                ? 'bg-orange-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                        Changes Requested ({stats?.changes_requested || 0})
                    </button>
                </div>

                {/* Approvals by Project */}
                {Object.keys(groupedByProject).length > 0 ? (
                    <div className="space-y-6">
                        {Object.entries(groupedByProject).map(([projectId, group]) => (
                            <div key={projectId}>
                                <div className="bg-white dark:bg-gray-800 rounded-t-lg shadow px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                    <Link
                                        href={route('approval-projects.show', group.project.id)}
                                        className="inline-flex items-center gap-2 hover:text-blue-600"
                                    >
                                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                            {group.project.name}
                                        </h2>
                                    </Link>
                                </div>
                                <div className="bg-white dark:bg-gray-800 rounded-b-lg shadow divide-y divide-gray-200 dark:divide-gray-700">
                                    {group.items.map((approval) => (
                                        <Link
                                            key={approval.id}
                                            href={route('approval-projects.items.show', [group.project.id, approval.id])}
                                            className={`block p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition ${statusColors[approval.status]}`}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                                                            {approval.title || `Request #${approval.id}`}
                                                        </h3>
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 whitespace-nowrap">
                                                            Step {approval.current_step_number}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                                        Submitted by {approval.requester?.name} on{' '}
                                                        {new Date(approval.submitted_at).toLocaleDateString()}
                                                    </p>
                                                    {approval.description && (
                                                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                                                            {approval.description}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <div className="text-right">
                                                        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                                                            approval.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                            approval.status === 'changes_requested' ? 'bg-orange-100 text-orange-800' :
                                                            'bg-gray-100 text-gray-800'
                                                        }`}>
                                                            {approval.status.replace('_', ' ')}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">All caught up!</h3>
                        <p className="text-gray-600 dark:text-gray-400">
                            You have no pending approvals at this time.
                        </p>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
