import { Link, router, usePage } from '@inertiajs/react';
import { useState, useCallback, useRef } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Avatar from '../../Components/Avatar';
import LinkButton from '../../Components/LinkButton';
import Pagination from '../../Components/Pagination';
import EmptyState from '../../Components/EmptyState';
import { ConfirmModal } from '../../Components/Modal';
import Tooltip from '../../Components/Tooltip';

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

const ExternalLinkIcon = () => (
    <svg className="h-3.5 w-3.5 inline ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
);

// Morph class => human label, for the assignment chips' tooltips.
const ASSIGN_TYPE_LABEL = {
    'App\\Models\\User': 'User',
    'App\\Models\\Team': 'Team',
    'App\\Models\\Department': 'Department',
    'App\\Models\\Division': 'Division',
    'App\\Models\\LinkGroup': 'Group',
    'Spatie\\Permission\\Models\\Role': 'Role',
};

export default function Index() {
    const { links, users, auth, filters } = usePage().props;
    const canManage = auth.user?.permissions?.includes('manage-links');
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [search, setSearch] = useState(filters?.search || '');
    const [userId, setUserId] = useState(filters?.user_id || '');
    const debounceRef = useRef(null);

    const applyFilters = useCallback((overrides = {}) => {
        const params = {
            search: overrides.search ?? search,
            user_id: overrides.user_id ?? userId,
        };
        Object.keys(params).forEach((key) => { if (!params[key]) delete params[key]; });
        router.get('/links', params, { preserveState: true, preserveScroll: true });
    }, [search, userId]);

    const handleSearchChange = (value) => {
        setSearch(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => applyFilters({ search: value }), 300);
    };

    const handleUserFilter = (value) => {
        setUserId(value);
        applyFilters({ user_id: value });
    };

    const clearFilters = () => {
        setSearch('');
        setUserId('');
        router.get('/links', {}, { preserveState: true, preserveScroll: true });
    };

    const hasActiveFilters = !!search || !!userId;

    const handleDelete = () => {
        if (deleteTarget) {
            router.delete(`/links/${deleteTarget.id}`);
            setDeleteTarget(null);
        }
    };

    return (
        <AuthenticatedLayout title="Links & URLs">
            <div>
                <PageHeader
                    title="Links & URLs"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Links & URLs' },
                    ]}
                    actions={canManage && (
                        <div className="flex gap-2">
                            <LinkButton href="/links/groups" variant="secondary">Manage Groups</LinkButton>
                            <LinkButton href="/links/create">Add Link</LinkButton>
                        </div>
                    )}
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
                            placeholder="Search links..."
                            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>
                    {canManage && users.length > 0 && (
                        <select
                            value={userId}
                            onChange={(e) => handleUserFilter(e.target.value)}
                            className="py-1.5 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                            <option value="">All Users</option>
                            {users.map((u) => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                    )}
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
                    {links.data.length > 0 ? (
                        <>
                            <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Title</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Description</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">URL</th>
                                        {canManage && (
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">Assigned To</th>
                                        )}
                                        {canManage && (
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {links.data.map((link) => {
                                        const displayTitle = link.title.length > 50 ? link.title.substring(0, 50) + '...' : link.title;
                                        const displayDescription = link.description && link.description.length > 50 ? link.description.substring(0, 50) + '...' : (link.description || '—');
                                        const displayUrl = link.url.replace(/^https?:\/\//, '').substring(0, 40);
                                        const urlTruncated = link.url.replace(/^https?:\/\//, '').length > 40;

                                        return (
                                        <tr key={link.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                                                {link.title.length > 50 ? (
                                                    <Tooltip content={link.title} position="top">
                                                        <span className="cursor-help">{displayTitle}</span>
                                                    </Tooltip>
                                                ) : (
                                                    link.title
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs hidden md:table-cell">
                                                {link.description && link.description.length > 50 ? (
                                                    <Tooltip content={link.description} position="top">
                                                        <span className="truncate cursor-help">{displayDescription}</span>
                                                    </Tooltip>
                                                ) : (
                                                    displayDescription
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm">
                                                {link.url ? (
                                                    urlTruncated ? (
                                                        <Tooltip content={link.url} position="top">
                                                            <a
                                                                href={link.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center max-w-xs truncate cursor-help"
                                                            >
                                                                {displayUrl}...
                                                                <ExternalLinkIcon />
                                                            </a>
                                                        </Tooltip>
                                                    ) : (
                                                        <a
                                                            href={link.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center"
                                                        >
                                                            {displayUrl}
                                                            <ExternalLinkIcon />
                                                        </a>
                                                    )
                                                ) : '—'}
                                            </td>
                                            {canManage && (
                                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                                                    {(() => {
                                                        // A link can now target several users/groups at once.
                                                        const targets = link.assignments ?? [];
                                                        if (targets.length === 0) {
                                                            return link.user ? (
                                                                <div className="flex items-center gap-2">
                                                                    <Avatar name={link.user.name} size="sm" />
                                                                    {link.user.name}
                                                                </div>
                                                            ) : '—';
                                                        }
                                                        return (
                                                            <div className="flex flex-wrap gap-1">
                                                                {targets.map((a) => (
                                                                    <span
                                                                        key={`${a.assignable_type}-${a.assignable_id}`}
                                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                                                        title={ASSIGN_TYPE_LABEL[a.assignable_type] || ''}
                                                                    >
                                                                        {a.assignable?.name ?? `#${a.assignable_id}`}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                            )}
                                            {canManage && (
                                                <td className="px-6 py-4 text-sm text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Tooltip content="Edit">
                                                            <Link
                                                                href={`/links/${link.id}/edit`}
                                                                className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                                                            >
                                                                <EditIcon />
                                                            </Link>
                                                        </Tooltip>
                                                        <Tooltip content="Delete">
                                                            <button
                                                                onClick={() => setDeleteTarget(link)}
                                                                className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                                            >
                                                                <TrashIcon />
                                                            </button>
                                                        </Tooltip>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            </div>
                            <Pagination links={links.links} />
                        </>
                    ) : (
                        <EmptyState
                            title={hasActiveFilters ? "No matching links" : "No links yet"}
                            description={hasActiveFilters ? "Try adjusting your search." : (canManage ? "Create your first link to get started." : "No links have been assigned to you yet.")}
                        />
                    )}
                </Card>
            </div>

            <ConfirmModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Link"
                message={`Delete link "${deleteTarget?.title}"? This action cannot be undone.`}
            />
        </AuthenticatedLayout>
    );
}
