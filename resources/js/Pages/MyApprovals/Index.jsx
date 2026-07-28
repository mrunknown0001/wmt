import { Head, Link, router } from '@inertiajs/react';
import { useState, useRef, useEffect } from 'react';
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

export default function Index({ pendingApprovals, stats, filters = {}, trail, trailStats, trailProjects = [], trailFilters = {} }) {
    // Filtering is server-side now (so it composes with search and pagination).
    const filteredStatus = filters.status || 'all';
    const [search, setSearch] = useState(filters.search || '');
    const searchTimeout = useRef(null);

    // Live queue: refresh in place when a new approval lands, so an approver sitting
    // on this page sees it without reloading. NotificationBell owns the Echo
    // subscription and re-broadcasts each notification as a `wmt:notification`
    // window event, so we piggyback on that rather than opening a second socket.
    const refreshTimeout = useRef(null);
    const refreshing = useRef(false);
    // Seeded at mount: the page already arrived with fresh data, so the refocus
    // catch-up shouldn't fire immediately after load.
    const lastRefresh = useRef(Date.now());

    const refreshQueue = () => {
        if (refreshing.current) return;
        refreshing.current = true;
        lastRefresh.current = Date.now();

        // Partial reload: re-requests the current URL, so the active filter,
        // search term and page are carried through untouched.
        router.reload({
            only: ['pendingApprovals', 'stats', 'trail', 'trailStats'],
            preserveScroll: true,
            preserveState: true,
            onFinish: () => { refreshing.current = false; },
        });
    };

    useEffect(() => {
        const handler = (e) => {
            const n = e.detail;
            // Approval traffic only — comments, mentions and task events must not
            // churn this page. Matched on the `approval_` prefix rather than an
            // explicit list so new notification types are picked up automatically.
            const isApproval = n && (
                (typeof n.type === 'string' && n.type.startsWith('approval_'))
                || n.approval_item_id != null
            );
            if (!isApproval) return;

            // A single decision can fan out several notifications; coalesce them
            // into one request instead of reloading once per event.
            clearTimeout(refreshTimeout.current);
            refreshTimeout.current = setTimeout(refreshQueue, 600);
        };

        // Catch-up on refocus. If the socket dropped while the tab was hidden or the
        // machine asleep, the missed notifications are gone — this resyncs on return.
        // Throttled so quick tab-flicking doesn't hammer the server.
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() - lastRefresh.current < 30000) return;
            refreshQueue();
        };

        window.addEventListener('wmt:notification', handler);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearTimeout(refreshTimeout.current);
            window.removeEventListener('wmt:notification', handler);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    // The queue and the approval trail each own their own query params, so every
    // navigation carries the other section's params through untouched.
    const currentQuery = () =>
        Object.fromEntries(new URLSearchParams(window.location.search).entries());

    const visit = (params) => {
        Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
        router.get(route('my-approvals.index'), params, { preserveState: true, preserveScroll: true });
    };

    const applyFilters = (overrides = {}) => {
        visit({
            ...currentQuery(),
            status: overrides.status ?? (filteredStatus === 'all' ? '' : filteredStatus),
            search: overrides.search ?? search,
            page: '', // a changed filter invalidates the current page
        });
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

    // --- Approval trail ---
    const [trailSearch, setTrailSearch] = useState(trailFilters.search || '');
    const trailSearchTimeout = useRef(null);
    const trailDecision = trailFilters.decision || '';
    const trailProjectId = trailFilters.project_id ?? '';

    const applyTrailFilters = (overrides = {}) => {
        visit({
            ...currentQuery(),
            trail_decision: overrides.decision ?? trailDecision,
            trail_search: overrides.search ?? trailSearch,
            trail_project_id: overrides.project_id ?? trailProjectId,
            trail_page: '', // a changed filter invalidates the current trail page
        });
    };

    const handleTrailSearchChange = (value) => {
        setTrailSearch(value);
        clearTimeout(trailSearchTimeout.current);
        trailSearchTimeout.current = setTimeout(() => applyTrailFilters({ search: value }), 300);
    };

    const trailRows = trail?.data ?? [];
    const hasTrailFilters = !!trailSearch || !!trailDecision || trailProjectId !== '';

    // Collapsed project groups, persisted so an approver's chosen layout survives
    // navigation and reloads. Stores only the collapsed ids, so new projects
    // default to expanded.
    const COLLAPSE_KEY = 'my_approvals_collapsed_projects';
    const [collapsed, setCollapsed] = useState(() => {
        try {
            return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]'));
        } catch {
            return new Set();
        }
    });

    const toggleProject = (projectId) => {
        setCollapsed((prev) => {
            const next = new Set(prev);
            next.has(String(projectId)) ? next.delete(String(projectId)) : next.add(String(projectId));
            try {
                localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
            } catch { /* storage unavailable — collapsing still works for this visit */ }
            return next;
        });
    };

    const isCollapsed = (projectId) => collapsed.has(String(projectId));

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
                                <div className={`bg-white dark:bg-gray-800 shadow px-6 py-4 flex items-center gap-3 ${
                                    isCollapsed(projectId) ? 'rounded-lg' : 'rounded-t-lg border-b border-gray-200 dark:border-gray-700'
                                }`}>
                                    <button
                                        type="button"
                                        onClick={() => toggleProject(projectId)}
                                        aria-expanded={!isCollapsed(projectId)}
                                        title={isCollapsed(projectId) ? 'Expand' : 'Collapse'}
                                        className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                                    >
                                        <svg
                                            className={`h-4 w-4 transition-transform ${isCollapsed(projectId) ? '-rotate-90' : ''}`}
                                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                                            strokeLinecap="round" strokeLinejoin="round"
                                        >
                                            <path d="M19 9l-7 7-7-7" />
                                        </svg>
                                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                            {group.project.name}
                                        </h2>
                                    </button>
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                        {group.items.length}
                                    </span>
                                    <Link
                                        href={route('approval-projects.show', group.project.id)}
                                        className="ml-auto text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                                    >
                                        Open project
                                    </Link>
                                </div>
                                <div className={`bg-white dark:bg-gray-800 rounded-b-lg shadow divide-y divide-gray-200 dark:divide-gray-700 ${
                                    isCollapsed(projectId) ? 'hidden' : ''
                                }`}>
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

                {/* Approval Trail — decisions this approver has already made */}
                <div className="pt-4">
                    <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Approval Trail</h2>
                            <p className="text-gray-600 dark:text-gray-400 mt-1">
                                A record of every decision you've made, most recent first
                            </p>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="text-right">
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Total</p>
                                <p className="text-2xl font-bold text-gray-900 dark:text-white">{trailStats?.total ?? 0}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Approved</p>
                                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{trailStats?.approved ?? 0}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Rejected</p>
                                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{trailStats?.rejected ?? 0}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4 flex flex-wrap items-center gap-3">
                        <input
                            type="text"
                            value={trailSearch}
                            onChange={(e) => handleTrailSearchChange(e.target.value)}
                            placeholder="Search trail by request, project, requester or comment..."
                            className="flex-1 min-w-[16rem] px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                        <select
                            value={trailProjectId}
                            onChange={(e) => applyTrailFilters({ project_id: e.target.value })}
                            className="px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="">All Approval Projects</option>
                            {trailProjects.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <select
                            value={trailDecision}
                            onChange={(e) => applyTrailFilters({ decision: e.target.value })}
                            className="px-4 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="">All Decisions</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                        {hasTrailFilters && (
                            <button
                                onClick={() => { setTrailSearch(''); applyTrailFilters({ search: '', decision: '', project_id: '' }); }}
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {trailRows.length > 0 ? (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-900">
                                        <tr>
                                            {['Decision', 'Request', 'Approval Project', 'Requester', 'Step', 'Comment', 'Decided'].map((h) => (
                                                <th
                                                    key={h}
                                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {trailRows.map((row) => (
                                            <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                                                        row.decision === 'approved'
                                                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                                                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                                                    }`}>
                                                        {capitalizeStatus(row.decision)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 min-w-[14rem] max-w-[20rem]">
                                                    {row.project_id && row.item_id ? (
                                                        <Link
                                                            href={route('approval-projects.items.show', [row.project_id, row.item_id])}
                                                            title={row.item_title || `Request #${row.item_id}`}
                                                            className="block truncate font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                                                        >
                                                            {row.series_number && (
                                                                <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-2">{row.series_number}</span>
                                                            )}
                                                            {row.item_title || `Request #${row.item_id}`}
                                                        </Link>
                                                    ) : (
                                                        <span className="text-gray-500 dark:text-gray-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                                    {row.project_name || '—'}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                                    {row.requester || '—'}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                                    {row.step_name || (row.step_number ? `Step ${row.step_number}` : '—')}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 max-w-xs">
                                                    <span className="line-clamp-2">{row.comment || '—'}</span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                                    {row.decided_at
                                                        ? new Date(row.decided_at).toLocaleString(undefined, {
                                                            year: 'numeric', month: 'short', day: 'numeric',
                                                            hour: '2-digit', minute: '2-digit',
                                                        })
                                                        : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <Pagination links={trail?.links} />
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                            <p className="text-gray-600 dark:text-gray-400">
                                {hasTrailFilters
                                    ? 'No decisions match your search or filter.'
                                    : "You haven't decided on any requests yet."}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
