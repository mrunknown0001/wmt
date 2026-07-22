import { Head, Link, router } from '@inertiajs/react';
import { useState, useRef } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';
import Pagination from '../../Components/Pagination';

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

const capitalizeStatus = (status) => {
    if (!status) return '';
    return status
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

export default function Index({ pendingApprovals, stats, filters = {} }) {
    // Filtering is server-side now (so it composes with search and pagination).
    const filteredStatus = filters.status || 'all';
    const [search, setSearch] = useState(filters.search || '');
    const searchTimeout = useRef(null);

    const applyFilters = (overrides = {}) => {
        const params = {
            status: overrides.status ?? (filteredStatus === 'all' ? '' : filteredStatus),
            search: overrides.search ?? search,
        };
        Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
        router.get(route('my-approvals.index'), params, { preserveState: true, preserveScroll: true });
    };

    const applyFilter = (status) => applyFilters({ status: status === 'all' ? '' : status });

    const handleSearchChange = (value) => {
        setSearch(value);
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => applyFilters({ search: value }), 300);
    };

    const clearSearch = () => {
        setSearch('');
        applyFilters({ search: '' });
    };

    const filtered = pendingApprovals?.data ?? [];

    const groupedByProject = {};
    filtered.forEach((approval) => {
        if (!approval) return;
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
                    {[
                        { value: 'pending', label: 'Pending Approvals', count: stats?.pending || 0, title: 'Show only requests awaiting your decision' },
                        { value: 'changes_requested', label: 'Changes Requested', count: stats?.changes_requested || 0, title: 'Show only requests needing changes' },
                        { value: 'decided', label: 'Decided This Week', count: stats?.decided_this_week || 0, title: 'Show requests you decided this week' },
                    ].map((card) => {
                        const active = filteredStatus === card.value;
                        return (
                            <button
                                key={card.value}
                                type="button"
                                onClick={() => applyFilter(active ? 'all' : card.value)}
                                aria-pressed={active}
                                title={card.title}
                                className={`text-left bg-white dark:bg-gray-800 rounded-lg shadow p-6 transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                    active ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-blue-300 dark:hover:ring-blue-700'
                                }`}
                            >
                                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{card.label}</p>
                                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{card.count}</p>
                            </button>
                        );
                    })}
                </div>

                {/* Search */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex items-center gap-3">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder="Search by request title, description or requester..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                    {search && (
                        <button
                            onClick={clearSearch}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                        >
                            Clear search
                        </button>
                    )}
                </div>

                {/* Filters */}
                <div className="flex gap-2">
                    {[
                        { value: 'all', label: 'All', activeClass: 'bg-blue-600 text-white' },
                        { value: 'pending', label: `Pending (${stats?.pending || 0})`, activeClass: 'bg-yellow-600 text-white' },
                        { value: 'changes_requested', label: `Changes Requested (${stats?.changes_requested || 0})`, activeClass: 'bg-orange-600 text-white' },
                        { value: 'decided', label: `Decided This Week (${stats?.decided_this_week || 0})`, activeClass: 'bg-green-600 text-white' },
                    ].map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => applyFilter(tab.value)}
                            className={`px-4 py-2 rounded-lg font-medium transition ${
                                filteredStatus === tab.value
                                    ? tab.activeClass
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
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
                                                            {capitalizeStatus(approval.status)}
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
                            {filteredStatus === 'all'
                                ? 'You have no pending approvals at this time.'
                                : 'No requests match this filter.'}
                        </p>
                    </div>
                )}

                {filtered.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                        <Pagination links={pendingApprovals?.links} />
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
