import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, usePage } from '@inertiajs/react';
import { useState } from 'react';

const TrashIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
);

const RestoreIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0H7.977M2.723 13.52a10.5 10.5 0 002.6 5.623c3.946 5.186 10.046 6.842 15.146 3.054m0-13.202a10.5 10.5 0 00-2.6-5.623C9.933 1.534 3.833-.122-1.267 3.654" />
    </svg>
);

const ChevronDownIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
);

export default function TrashIndex() {
    const { items, pagination, filters } = usePage().props;
    const [selectedType, setSelectedType] = useState(filters.type || '');
    const [deletingId, setDeletingId] = useState(null);
    const [restoringId, setRestoringId] = useState(null);

    const types = [
        { value: '', label: 'All Items' },
        { value: 'divisions', label: 'Divisions' },
        { value: 'departments', label: 'Departments' },
        { value: 'teams', label: 'Teams' },
        { value: 'users', label: 'Users' },
        { value: 'projects', label: 'Projects' },
        { value: 'tasks', label: 'Tasks' },
        { value: 'links', label: 'Links' },
        { value: 'folders', label: 'Folders' },
    ];

    const handleFilterChange = (typeValue) => {
        setSelectedType(typeValue);
        const params = [];
        if (typeValue) {
            params.push(`type=${encodeURIComponent(typeValue)}`);
        }
        if (pagination.current_page > 1) {
            params.push('page=1');
        }
        const url = params.length > 0 ? `/trash?${params.join('&')}` : '/trash';
        router.get(url, {}, { preserveScroll: true });
    };

    const handleRestore = (type, id) => {
        setRestoringId(`${type}-${id}`);
        router.post(
            `/trash/${type}/${id}/restore`,
            {},
            {
                onFinish: () => setRestoringId(null),
            }
        );
    };

    const handleDelete = (type, id) => {
        if (!confirm('Are you sure? This will permanently delete this item.')) {
            return;
        }
        setDeletingId(`${type}-${id}`);
        router.delete(
            `/trash/${type}/${id}`,
            {
                onFinish: () => setDeletingId(null),
            }
        );
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getTypeBadgeColor = (type) => {
        const colors = {
            divisions: 'bg-blue-100 text-blue-800',
            departments: 'bg-indigo-100 text-indigo-800',
            teams: 'bg-purple-100 text-purple-800',
            users: 'bg-amber-100 text-amber-800',
            projects: 'bg-green-100 text-green-800',
            tasks: 'bg-cyan-100 text-cyan-800',
            links: 'bg-rose-100 text-rose-800',
            folders: 'bg-gray-100 text-gray-800',
        };
        return colors[type] || 'bg-gray-100 text-gray-800';
    };

    const getTypeName = (type) => {
        return type.charAt(0).toUpperCase() + type.slice(1, -1);
    };

    return (
        <AuthenticatedLayout>
            <Head title="Trash Bin" />

            <div className="px-4 py-6 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                            Trash Bin
                        </h1>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                            Deleted items are permanently removed after 30 days
                        </p>
                    </div>
                </div>

                <div className="mb-6 flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Filter by type:
                    </span>
                    <div className="relative inline-block">
                        <select
                            value={selectedType}
                            onChange={(e) => handleFilterChange(e.target.value)}
                            className="appearance-none bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg py-2 px-3 pr-8 leading-tight focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        >
                            {types.map((type) => (
                                <option key={type.value} value={type.value}>
                                    {type.label}
                                </option>
                            ))}
                        </select>
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none w-4 h-4">
                            <ChevronDownIcon />
                        </div>
                    </div>
                </div>

                {items.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="mx-auto h-12 w-12 text-gray-400">
                            <TrashIcon />
                        </div>
                        <p className="mt-4 text-gray-600 dark:text-gray-400">
                            No trashed items found
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse">
                            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Item
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Type
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Deleted
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Days Until Purge
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {items.map((item) => (
                                    <tr
                                        key={`${item.type}-${item.id}`}
                                        className="hover:bg-gray-50 dark:hover:bg-gray-700"
                                    >
                                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white truncate">
                                            {item.label}
                                        </td>
                                        <td className="px-6 py-4 text-sm">
                                            <span
                                                className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getTypeBadgeColor(
                                                    item.type
                                                )}`}
                                            >
                                                {getTypeName(item.type)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                            {formatDate(item.deleted_at)}
                                        </td>
                                        <td className="px-6 py-4 text-sm">
                                            <div className="flex items-center gap-2">
                                                <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                                    <div
                                                        className={`h-2 rounded-full ${
                                                            item.days_remaining > 10
                                                                ? 'bg-green-500'
                                                                : item.days_remaining > 3
                                                                ? 'bg-yellow-500'
                                                                : 'bg-red-500'
                                                        }`}
                                                        style={{
                                                            width: `${Math.max(0, (item.days_remaining / 30) * 100)}%`,
                                                        }}
                                                    ></div>
                                                </div>
                                                <span className="text-xs font-medium">
                                                    {Math.max(0, item.days_remaining)}d
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-medium space-x-3">
                                            <button
                                                onClick={() =>
                                                    handleRestore(
                                                        item.type,
                                                        item.id
                                                    )
                                                }
                                                disabled={
                                                    restoringId ===
                                                    `${item.type}-${item.id}`
                                                }
                                                className="inline-flex items-center gap-2 text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <div className="w-4 h-4">
                                                    <RestoreIcon />
                                                </div>
                                                Restore
                                            </button>
                                            <button
                                                onClick={() =>
                                                    handleDelete(item.type, item.id)
                                                }
                                                disabled={
                                                    deletingId ===
                                                    `${item.type}-${item.id}`
                                                }
                                                className="inline-flex items-center gap-2 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <div className="w-4 h-4">
                                                    <TrashIcon />
                                                </div>
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {items.length > 0 && (
                    <div className="mt-6 flex items-center justify-between">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            Showing page {pagination.current_page} of{' '}
                            {pagination.last_page} (
                            {pagination.total} total items)
                        </div>
                        <div className="space-x-2">
                            {pagination.current_page > 1 && (
                                <button
                                    onClick={() => {
                                        const params = [];
                                        if (filters.type) {
                                            params.push(`type=${encodeURIComponent(filters.type)}`);
                                        }
                                        params.push(`page=${pagination.current_page - 1}`);
                                        router.get(`/trash?${params.join('&')}`, {}, { preserveScroll: true });
                                    }}
                                    className="inline-block px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Previous
                                </button>
                            )}
                            {pagination.current_page < pagination.last_page && (
                                <button
                                    onClick={() => {
                                        const params = [];
                                        if (filters.type) {
                                            params.push(`type=${encodeURIComponent(filters.type)}`);
                                        }
                                        params.push(`page=${pagination.current_page + 1}`);
                                        router.get(`/trash?${params.join('&')}`, {}, { preserveScroll: true });
                                    }}
                                    className="inline-block px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Next
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
