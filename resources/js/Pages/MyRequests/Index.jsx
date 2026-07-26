import { Head, Link, router, usePage } from '@inertiajs/react';
import { useState, useCallback, useRef } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';
import Pagination from '../../Components/Pagination';

const STATUS_OPTIONS = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'changes_requested', label: 'Changes Requested' },
    { value: 'cancelled', label: 'Cancelled' },
];

const statusColor = (status) => ({
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    changes_requested: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
}[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200');

const humanize = (s) => (s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export default function Index({ items, stats, projects = [], availableProjects = [], filters = {} }) {
    const [search, setSearch] = useState(filters.search || '');
    const [status, setStatus] = useState(filters.status || '');
    const [projectId, setProjectId] = useState(filters.approval_project_id || '');
    const debounceRef = useRef(null);

    const applyFilters = useCallback((overrides = {}) => {
        const params = {
            search: overrides.search ?? search,
            status: overrides.status ?? status,
            approval_project_id: overrides.approval_project_id ?? projectId,
        };
        Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
        router.get(route('my-requests.index'), params, { preserveState: true, preserveScroll: true });
    }, [search, status, projectId]);

    const handleSearchChange = (value) => {
        setSearch(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => applyFilters({ search: value }), 300);
    };

    const clearFilters = () => {
        setSearch(''); setStatus(''); setProjectId('');
        router.get(route('my-requests.index'), {}, { preserveState: true, preserveScroll: true });
    };

    // Send the requestor back here (with their filters/page intact) instead of to
    // the approval project's request list, which requestors can't access.
    const { url: pageUrl } = usePage();
    const backParam = '?back=' + encodeURIComponent(pageUrl);

    const hasActiveFilters = !!search || !!status || !!projectId;
    const hasAnyRequests = (stats?.total ?? 0) > 0;

    // "New Request" — pick an active approval project to submit against.
    const newRequest = (pid) => { if (pid) router.visit(route('approval-projects.items.create', pid)); };

    const NewRequestControl = () => {
        if (availableProjects.length === 0) return null;
        if (availableProjects.length === 1) {
            return (
                <Link href={route('approval-projects.items.create', availableProjects[0].id)}>
                    <Button>New Request</Button>
                </Link>
            );
        }
        return (
            <select
                onChange={(e) => newRequest(e.target.value)}
                defaultValue=""
                className="px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
            >
                <option value="" disabled>New Request in…</option>
                {availableProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
        );
    };

    // Clicking a card filters the table by that status ("Total" clears the filter).
    // Other active filters (search / project) are preserved.
    const StatCard = ({ label, value, tone = '', filterStatus = '' }) => {
        const active = status === filterStatus;
        return (
            <button
                type="button"
                onClick={() => { setStatus(filterStatus); applyFilters({ status: filterStatus }); }}
                aria-pressed={active}
                title={filterStatus ? `Show only ${label.toLowerCase()} requests` : 'Show all requests'}
                className={`text-left bg-white dark:bg-gray-800 rounded-lg shadow p-4 transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    active ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-blue-300 dark:hover:ring-blue-700'
                }`}
            >
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${tone || 'text-gray-900 dark:text-white'}`}>{value ?? 0}</p>
            </button>
        );
    };

    return (
        <AuthenticatedLayout title="My Requests">
            <Head title="My Requests" />
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Requests</h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">Track the approval requests you submitted</p>
                    </div>
                    <NewRequestControl />
                </div>

                {/* Status summary */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <StatCard label="Total" value={stats?.total} filterStatus="" />
                    <StatCard label="Pending" value={stats?.pending} tone="text-yellow-600" filterStatus="pending" />
                    <StatCard label="Approved" value={stats?.approved} tone="text-green-600" filterStatus="approved" />
                    <StatCard label="Rejected" value={stats?.rejected} tone="text-red-600" filterStatus="rejected" />
                    <StatCard label="Changes Requested" value={stats?.changes_requested} tone="text-blue-600" filterStatus="changes_requested" />
                </div>

                {/* Search + filters */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex flex-wrap gap-3">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder="Search my requests..."
                        className="flex-1 min-w-48 px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                    <select
                        value={status}
                        onChange={(e) => { setStatus(e.target.value); applyFilters({ status: e.target.value }); }}
                        className="px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        <option value="">All Statuses</option>
                        {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    {projects.length > 0 && (
                        <select
                            value={projectId}
                            onChange={(e) => { setProjectId(e.target.value); applyFilters({ approval_project_id: e.target.value }); }}
                            className="px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="">All Projects</option>
                            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    )}
                    {hasActiveFilters && (
                        <button onClick={clearFilters} className="text-sm text-blue-600 dark:text-blue-400 hover:underline px-2">
                            Clear filters
                        </button>
                    )}
                </div>

                {/* Requests table */}
                {items.data && items.data.length > 0 ? (
                    <>
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Request</th>
                                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Approval Project</th>
                                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Status</th>
                                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Current Step</th>
                                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Submitted</th>
                                        <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {items.data.map((item) => {
                                        const activeStep = item.step_instances?.[0];
                                        return (
                                            <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                                                <td className="px-6 py-4">
                                                    <p className="font-medium text-gray-900 dark:text-white">{item.title || 'Untitled'}</p>
                                                    {item.description && (
                                                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-md">{item.description}</p>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-gray-700 dark:text-gray-300">{item.approval_project?.name || '—'}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${statusColor(item.status)}`}>
                                                        {humanize(item.status)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                                    {item.status === 'pending' && activeStep
                                                        ? (activeStep.step?.name || `Step ${activeStep.step_number}`)
                                                        : '—'}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                                    {item.submitted_at || item.created_at
                                                        ? new Date(item.submitted_at || item.created_at).toLocaleDateString()
                                                        : '—'}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {/* Every request here is the viewer's own, so the
                                                            status alone decides if it can be resubmitted. */}
                                                        {item.status === 'changes_requested' && (
                                                            <button
                                                                onClick={() => router.post(
                                                                    route('approval-projects.items.resubmit', [item.approval_project_id, item.id]),
                                                                    {},
                                                                    { preserveScroll: true },
                                                                )}
                                                                className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition"
                                                            >
                                                                Resubmit
                                                            </button>
                                                        )}
                                                        <Link
                                                            href={route('approval-projects.items.show', [item.approval_project_id, item.id]) + backParam}
                                                            className="inline-flex items-center gap-1 px-3 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white text-sm font-medium rounded transition"
                                                        >
                                                            View
                                                        </Link>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                            <Pagination links={items.links} />
                        </div>
                    </>
                ) : hasActiveFilters ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <p className="text-gray-600 dark:text-gray-400 mb-4">No requests match your search or filters</p>
                        <button onClick={clearFilters} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                            Clear filters
                        </button>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <p className="text-gray-900 dark:text-white font-medium mb-1">You haven't submitted any requests yet</p>
                        <p className="text-gray-600 dark:text-gray-400 mb-6">
                            Submit a request here (with attachments) as an alternative to the public request form.
                        </p>
                        <div className="flex justify-center"><NewRequestControl /></div>
                    </div>
                )}
                {!hasAnyRequests && null}
            </div>
        </AuthenticatedLayout>
    );
}
