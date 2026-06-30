import { Link, router, usePage } from '@inertiajs/react';
import { useState } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Avatar from '../../Components/Avatar';
import Badge from '../../Components/Badge';
import LinkButton from '../../Components/LinkButton';
import Pagination from '../../Components/Pagination';
import EmptyState from '../../Components/EmptyState';
import { ConfirmModal } from '../../Components/Modal';
import { formatLabel } from '../../utils';

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

export default function Index() {
    const { users } = usePage().props;
    const [deleteTarget, setDeleteTarget] = useState(null);

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
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {users.data.map((user) => (
                                        <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                                                <div className="flex items-center gap-3">
                                                    <Avatar name={user.name} size="sm" />
                                                    {user.name}
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
                                            <td className="px-6 py-4 text-sm text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Link
                                                        href={`/users/${user.id}/edit`}
                                                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                                                        title="Edit"
                                                    >
                                                        <EditIcon />
                                                    </Link>
                                                    <button
                                                        onClick={() => setDeleteTarget(user)}
                                                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                                        title="Delete"
                                                    >
                                                        <TrashIcon />
                                                    </button>
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
                        <EmptyState title="No users yet" description="Add your first user to get started" />
                    )}
                </Card>
            </div>

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
