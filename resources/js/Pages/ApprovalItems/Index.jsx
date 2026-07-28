import { Head, Link, usePage, router } from '@inertiajs/react';
import { useState, useCallback, useRef, Fragment } from 'react';
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

const CheckIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);

const EyeIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
);

export default function Index({ project, items, auth, chains = [], sections = [], requesters = [], filters = {}, archivedCount = 0, groupBySection = false }) {
    const [approvingItemId, setApprovingItemId] = useState(null);
    const showArchived = !!filters.archived;
    const [search, setSearch] = useState(filters.search || '');
    const [status, setStatus] = useState(filters.status || '');
    const [chainId, setChainId] = useState(filters.chain_id || '');
    const [requesterId, setRequesterId] = useState(filters.requester_id || '');
    const [sort, setSort] = useState(filters.sort || 'submitted_at');
    const [direction, setDirection] = useState(filters.direction || 'desc');
    const [sectionId, setSectionId] = useState(filters.section_id || '');
    const debounceRef = useRef(null);

    const applyFilters = useCallback((overrides = {}) => {
        const params = {
            search: overrides.search ?? search,
            status: overrides.status ?? status,
            chain_id: overrides.chain_id ?? chainId,
            requester_id: overrides.requester_id ?? requesterId,
            section_id: overrides.section_id ?? sectionId,
            sort: overrides.sort ?? sort,
            direction: overrides.direction ?? direction,
            archived: (overrides.archived ?? showArchived) ? 1 : '',
        };
        Object.keys(params).forEach((key) => { if (!params[key]) delete params[key]; });
        router.get(route('approval-projects.items.index', project.id), params, {
            preserveState: true,
            preserveScroll: true,
        });
    }, [search, status, chainId, requesterId, sectionId, sort, direction, showArchived, project.id]);

    const handleArchive = (item) => {
        const archiving = !item.archived_at;
        if (archiving && !confirm(`Archive "${item.title}"? It will be hidden from the active list.`)) return;
        router.patch(route('approval-projects.items.archive', [project.id, item.id]), {}, { preserveScroll: true });
    };

    const handleSort = (column) => {
        const newDirection = sort === column
            ? (direction === 'asc' ? 'desc' : 'asc')
            : (column === 'created_at' ? 'desc' : 'asc');
        setSort(column);
        setDirection(newDirection);
        applyFilters({ sort: column, direction: newDirection });
    };

    const handleSearchChange = (value) => {
        setSearch(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => applyFilters({ search: value }), 300);
    };

    const clearFilters = () => {
        setSearch('');
        setStatus('');
        setChainId('');
        setRequesterId('');
        setSectionId('');
        router.get(route('approval-projects.items.index', project.id), {}, {
            preserveState: true,
            preserveScroll: true,
        });
    };

    const hasActiveFilters = !!search || !!status || !!chainId || !!requesterId || !!sectionId;

    // Only show group headers once something is actually grouped — otherwise a
    // project with sections but no assignments gets a lone "No Section" banner.
    const showGroups = groupBySection && items.data?.some((i) => i.approval_section_id);

    // The current list query (filters + sort). Reused for the View link's back
    // param and the inline Approve action, so the approver always returns to this
    // exact filtered/sorted view.
    const listQuery = (() => {
        const params = { search, status, chain_id: chainId, requester_id: requesterId, section_id: sectionId, sort, direction, archived: showArchived ? 1 : '' };
        Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
        const qs = new URLSearchParams(params).toString();
        return qs ? '?' + qs : '';
    })();
    const backParam = listQuery ? `?back=${encodeURIComponent(listQuery)}` : '';

    const SortHeader = ({ column, children }) => {
        const active = sort === column;
        return (
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                <button
                    type="button"
                    onClick={() => handleSort(column)}
                    className="group inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
                >
                    {children}
                    <span className={`text-[10px] leading-none ${active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 opacity-0 group-hover:opacity-100'}`}>
                        {active ? (direction === 'asc' ? '▲' : '▼') : '▲'}
                    </span>
                </button>
            </th>
        );
    };

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
        if (!auth.user?.can_approve) return false;
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
                back: listQuery, // return to this filtered/sorted list after approving
            },
            {
                preserveScroll: true,
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
                            <span className="inline-flex items-center gap-1"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>Back</span>
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

                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-50 max-w-xs">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search requests..."
                            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>
                    <select
                        value={status}
                        onChange={(e) => { setStatus(e.target.value); applyFilters({ status: e.target.value }); }}
                        className="py-1.5 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="">All Statuses</option>
                        {STATUS_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </select>
                    {chains.length > 0 && (
                        <select
                            value={chainId}
                            onChange={(e) => { setChainId(e.target.value); applyFilters({ chain_id: e.target.value }); }}
                            className="py-1.5 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                            <option value="">All Chains</option>
                            {chains.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    )}
                    {requesters.length > 0 && (
                        <select
                            value={requesterId}
                            onChange={(e) => { setRequesterId(e.target.value); applyFilters({ requester_id: e.target.value }); }}
                            className="py-1.5 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                            <option value="">All Requesters</option>
                            {requesters.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>
                    )}
                    {sections.length > 0 && (
                        <select
                            value={sectionId}
                            onChange={(e) => { setSectionId(e.target.value); applyFilters({ section_id: e.target.value }); }}
                            className="py-1.5 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                            <option value="">All Sections</option>
                            {sections.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                            <option value="none">No Section</option>
                        </select>
                    )}
                    <button
                        type="button"
                        onClick={() => applyFilters({ archived: !showArchived })}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                            showArchived
                                ? 'bg-amber-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                        title={showArchived ? 'Back to active requests' : 'View archived requests'}
                    >
                        {showArchived ? 'Viewing Archived' : `Archived (${archivedCount})`}
                    </button>
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {items.data && items.data.length > 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <SortHeader column="series">Ref #</SortHeader>
                                    <SortHeader column="title">Title</SortHeader>
                                    <SortHeader column="requester">Requester</SortHeader>
                                    <SortHeader column="status">Status</SortHeader>
                                    <SortHeader column="chain">Chain</SortHeader>
                                    <SortHeader column="submitted_at">Submitted</SortHeader>
                                    <SortHeader column="created_at">Created</SortHeader>
                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {items.data.map((item, idx) => {
                                    // Rows arrive ordered by section, so a header row is
                                    // emitted whenever the section changes.
                                    const prev = idx > 0 ? items.data[idx - 1] : null;
                                    const startsGroup = showGroups
                                        && (idx === 0 || prev?.approval_section_id !== item.approval_section_id);
                                    return (
                                <Fragment key={item.id}>
                                {startsGroup && (
                                    <tr className="bg-gray-50 dark:bg-gray-900/50">
                                        <td colSpan={8} className="px-6 py-2">
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                                    style={{ backgroundColor: item.section?.color || '#9ca3af' }}
                                                />
                                                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                                    {item.section?.name || 'No Section'}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {item.series_number
                                                ? <span className="font-mono text-sm text-gray-700 dark:text-gray-300">{item.series_number}</span>
                                                : <span className="text-gray-300 dark:text-gray-600">—</span>}
                                        </td>
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
                                                {item.submitted_at
                                                    ? new Date(item.submitted_at).toLocaleDateString()
                                                    : <span className="text-gray-300 dark:text-gray-600">Not submitted</span>}
                                            </p>
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
                                                <Link href={route('approval-projects.items.show', [project.id, item.id]) + backParam}>
                                                    <button className="inline-flex items-center gap-1 px-3 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white text-sm font-medium rounded transition">
                                                        <EyeIcon />
                                                        View
                                                    </button>
                                                </Link>
                                                <button
                                                    onClick={() => handleArchive(item)}
                                                    title={item.archived_at ? 'Unarchive' : 'Archive'}
                                                    className="inline-flex items-center justify-center w-8 h-8 text-gray-500 hover:text-amber-600 dark:text-gray-400 dark:hover:text-amber-400 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30 transition"
                                                >
                                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : hasActiveFilters ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <p className="text-gray-600 dark:text-gray-400 mb-4">No approval requests match your filters</p>
                        <button
                            onClick={clearFilters}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            Clear filters
                        </button>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <p className="text-gray-600 dark:text-gray-400 mb-4">No approval requests yet</p>
                        <Link href={route('approval-projects.items.create', project.id)}>
                            <Button>Create Your First Request</Button>
                        </Link>
                    </div>
                )}

                {items.data && items.data.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                        <Pagination links={items.links} />
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
