import { Link, router, usePage } from '@inertiajs/react';
import { useState, useCallback, useMemo, useRef } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Avatar from '../../Components/Avatar';
import Badge from '../../Components/Badge';
import LinkButton from '../../Components/LinkButton';
import Pagination from '../../Components/Pagination';
import EmptyState from '../../Components/EmptyState';
import Modal, { ConfirmModal } from '../../Components/Modal';
import Button from '../../Components/Button';
import Tooltip from '../../Components/Tooltip';
import { formatLabel } from '../../utils';

const EyeIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
);

const EditIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
);

const TrashIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const HandoverIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 17l5-5-5-5M21 12H9M12 19H6a2 2 0 01-2-2V7a2 2 0 012-2h6" />
    </svg>
);

const CoverIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
);

const CapabilitiesIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
);

/** "12 Aug" — enough to read at a glance in a table cell. */
const shortDate = (value) => {
    if (!value) return '';
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export default function Index() {
    const { users, roles, filters, cover = [], openTasks = [], ownedProjects = [], canArrangeCover, auth } = usePage().props;
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [handoverFrom, setHandoverFrom] = useState(null);
    const [handoverTo, setHandoverTo] = useState('');

    // Reassigning somebody's whole workload is an admin action, not something
    // an executive who can merely read this list should be able to do.
    const canTransfer = auth?.user?.permissions?.includes('manage-users');
    // Viewing a person's full roles & capabilities is an admin-only feature.
    const isAdmin = auth?.user?.roles?.includes('admin');

    const openTaskCount = useMemo(
        () => new Map(openTasks.map((row) => [row.user_id, row.total])),
        [openTasks]
    );

    const ownedProjectCount = useMemo(
        () => new Map(ownedProjects.map((row) => [row.user_id, row.total])),
        [ownedProjects]
    );

    // Sent as a list rather than a map, so the lookup is built here.
    const coverByUser = useMemo(
        () => new Map(cover.map((c) => [c.user_id, c])),
        [cover]
    );
    const coverFor = (userId) => coverByUser.get(userId);

    const submitHandover = () => {
        router.post(`/users/${handoverFrom.id}/transfer-tasks`, { to_user_id: handoverTo }, {
            preserveScroll: true,
            onSuccess: () => { setHandoverFrom(null); setHandoverTo(''); },
        });
    };

    const [search, setSearch] = useState(filters?.search || '');
    const [role, setRole] = useState(filters?.role || '');
    const [status, setStatus] = useState(filters?.status || '');
    const debounceRef = useRef(null);

    const applyFilters = useCallback((overrides = {}) => {
        const params = {
            search: overrides.search ?? search,
            role: overrides.role ?? role,
            status: overrides.status ?? status,
        };
        Object.keys(params).forEach((key) => { if (!params[key]) delete params[key]; });
        router.get('/users', params, { preserveState: true, preserveScroll: true });
    }, [search, role, status]);

    const handleSearchChange = (value) => {
        setSearch(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => applyFilters({ search: value }), 300);
    };

    const handleRoleChange = (value) => {
        setRole(value);
        applyFilters({ role: value });
    };

    const handleStatusChange = (value) => {
        setStatus(value);
        applyFilters({ status: value });
    };

    const clearFilters = () => {
        setSearch('');
        setRole('');
        setStatus('');
        router.get('/users', {}, { preserveState: true, preserveScroll: true });
    };

    const hasActiveFilters = search || role || status;

    const handleDelete = () => {
        if (deleteTarget) {
            router.delete(`/users/${deleteTarget.id}`);
            setDeleteTarget(null);
        }
    };

    return (
        <AuthenticatedLayout title="Users">
            <div>
                <PageHeader
                    title="Users"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Users' },
                    ]}
                    actions={<LinkButton href="/users/create">Add User</LinkButton>}
                />

                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <div className="relative flex-1 max-w-xs">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search by name or email..."
                            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>
                    <select
                        value={role}
                        onChange={(e) => handleRoleChange(e.target.value)}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="">All Roles</option>
                        {(roles || []).map((r) => (
                            <option key={r} value={r}>{formatLabel(r)}</option>
                        ))}
                    </select>
                    <select
                        value={status}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                        <option value="">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                        >
                            Clear
                        </button>
                    )}
                </div>

                <Card padding={false}>
                    {users.data.length > 0 ? (
                        <>
                            <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">Email</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Role</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Department</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Task Cover</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {users.data.map((user) => (
                                        <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                                                <div className="flex items-center gap-3">
                                                    <Avatar name={user.name} size="sm" />
                                                    <Link href={`/users/${user.id}`} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                                        {user.name}
                                                    </Link>
                                                    {coverFor(user.id)?.running && (
                                                        <span
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                                            title={`Covered${coverFor(user.id).delegates?.length ? ` by ${coverFor(user.id).delegates.join(' & ')}` : ''} · ${coverFor(user.id).period}`}
                                                        >
                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                            Away
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">{user.email}</td>
                                            <td className="px-6 py-4 text-sm">
                                                <Badge color="blue">{formatLabel(user.roles?.[0]?.name || 'No role')}</Badge>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">{user.department?.name || '—'}</td>
                                            <td className="px-6 py-4 text-sm hidden sm:table-cell">
                                                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${user.is_active ? 'text-green-700 dark:text-green-400' : 'text-gray-500'}`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                    {user.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm hidden lg:table-cell">
                                                {coverFor(user.id) ? (
                                                    <Tooltip content={`${coverFor(user.id).delegates.join(' & ') || 'Nobody'} · ${coverFor(user.id).period}`}>
                                                        <Link
                                                            href="/task-delegations"
                                                            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                                                                coverFor(user.id).running
                                                                    ? 'text-amber-700 dark:text-amber-400'
                                                                    : 'text-blue-700 dark:text-blue-400'
                                                            }`}
                                                        >
                                                            <span className={`h-1.5 w-1.5 rounded-full ${coverFor(user.id).running ? 'bg-amber-500' : 'bg-blue-500'}`} />
                                                            {coverFor(user.id).running
                                                                ? `Covered until ${shortDate(coverFor(user.id).ends_on)}`
                                                                : `From ${shortDate(coverFor(user.id).starts_on)}`}
                                                        </Link>
                                                    </Tooltip>
                                                ) : (
                                                    <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    {canArrangeCover && (
                                                        <Tooltip content={coverFor(user.id) ? 'Task cover' : 'Arrange task cover'}>
                                                            <Link
                                                                href={`/task-delegations?for=${user.id}`}
                                                                className="p-1.5 text-gray-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                                                            >
                                                                <CoverIcon />
                                                            </Link>
                                                        </Tooltip>
                                                    )}
                                                    <Tooltip content="View Overview">
                                                        <Link
                                                            href={`/users/${user.id}`}
                                                            className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                                                        >
                                                            <EyeIcon />
                                                        </Link>
                                                    </Tooltip>
                                                    {isAdmin && (
                                                        <Tooltip content="Roles & capabilities">
                                                            <Link
                                                                href={`/users/${user.id}/capabilities`}
                                                                className="p-1.5 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
                                                            >
                                                                <CapabilitiesIcon />
                                                            </Link>
                                                        </Tooltip>
                                                    )}
                                                    <Tooltip content="Edit">
                                                        <Link
                                                            href={`/users/${user.id}/edit`}
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                                                        >
                                                            <EditIcon />
                                                        </Link>
                                                    </Tooltip>
                                                    {canTransfer && (
                                                        <Tooltip content={`Hand over work (${openTaskCount.get(user.id) || 0} tasks, ${ownedProjectCount.get(user.id) || 0} projects)`}>
                                                            <button
                                                                onClick={() => { setHandoverFrom(user); setHandoverTo(''); }}
                                                                className="p-1.5 text-gray-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                                                            >
                                                                <HandoverIcon />
                                                            </button>
                                                        </Tooltip>
                                                    )}
                                                    <Tooltip content="Delete">
                                                        <button
                                                            onClick={() => setDeleteTarget(user)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                                        >
                                                            <TrashIcon />
                                                        </button>
                                                    </Tooltip>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                            <Pagination links={users.links} />
                        </>
                    ) : (
                        <EmptyState
                            title={hasActiveFilters ? "No matching users" : "No users yet"}
                            description={hasActiveFilters ? "Try adjusting your filters." : "Add your first user to get started"}
                        />
                    )}
                </Card>
            </div>

            <Modal
                isOpen={!!handoverFrom}
                onClose={() => { setHandoverFrom(null); setHandoverTo(''); }}
                title="Hand Over Work"
                actions={
                    <>
                        <Button variant="secondary" onClick={() => { setHandoverFrom(null); setHandoverTo(''); }}>
                            Cancel
                        </Button>
                        <Button onClick={submitHandover} disabled={!handoverTo}>
                            Transfer
                        </Button>
                    </>
                }
            >
                <div className="space-y-4 text-left">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        Move every unfinished task and every project owned by{' '}
                        <span className="font-medium text-gray-900 dark:text-gray-100">{handoverFrom?.name}</span>{' '}
                        to somebody else. For when a person has left the organisation.
                    </p>

                    <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2 text-sm space-y-1">
                        <p className="text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                {openTaskCount.get(handoverFrom?.id) || 0}
                            </span>{' '}
                            unfinished {(openTaskCount.get(handoverFrom?.id) || 0) === 1 ? 'task' : 'tasks'}
                        </p>
                        <p className="text-gray-600 dark:text-gray-300">
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                                {ownedProjectCount.get(handoverFrom?.id) || 0}
                            </span>{' '}
                            {(ownedProjectCount.get(handoverFrom?.id) || 0) === 1 ? 'project' : 'projects'} they own
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Transfer to
                        </label>
                        <select
                            value={handoverTo}
                            onChange={(e) => setHandoverTo(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                            <option value="">Choose a person…</option>
                            {users.data
                                .filter((u) => u.id !== handoverFrom?.id && u.is_active)
                                .map((u) => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Only people on this page are listed — search above to find somebody else.
                        </p>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Completed and cancelled tasks stay where they are, so the record of who
                        did the work is not rewritten. Project ownership moves in full, including
                        archived projects and approval projects. This cannot be undone in bulk.
                    </p>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete User"
                message={`Are you sure you want to delete "${deleteTarget?.name}"?`}
            />
        </AuthenticatedLayout>
    );
}
