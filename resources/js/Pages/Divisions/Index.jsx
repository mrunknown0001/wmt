import { Link, router, usePage } from '@inertiajs/react';
import { useState } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Avatar from '../../Components/Avatar';
import LinkButton from '../../Components/LinkButton';
import Pagination from '../../Components/Pagination';
import EmptyState from '../../Components/EmptyState';
import { ConfirmModal } from '../../Components/Modal';

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
    const { divisions, auth } = usePage().props;
    const canManage = auth.user?.permissions?.includes('manage-divisions');
    const [deleteTarget, setDeleteTarget] = useState(null);

    const handleDelete = () => {
        if (deleteTarget) {
            router.delete(`/divisions/${deleteTarget.id}`);
            setDeleteTarget(null);
        }
    };

    return (
        <AuthenticatedLayout title="Divisions">
            <div>
                <PageHeader
                    title="Divisions"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Divisions' },
                    ]}
                    actions={canManage && <LinkButton href="/divisions/create">Add Division</LinkButton>}
                />

                <Card padding={false}>
                    {divisions.data.length > 0 ? (
                        <>
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Head</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Departments</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {divisions.data.map((division) => (
                                        <tr key={division.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{division.name}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">{division.description || '—'}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                {division.head ? (
                                                    <div className="flex items-center gap-2">
                                                        <Avatar name={division.head.name} size="sm" />
                                                        {division.head.name}
                                                    </div>
                                                ) : '—'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{division.departments_count}</td>
                                            <td className="px-6 py-4 text-sm text-right">
                                                {canManage && (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Link
                                                            href={`/divisions/${division.id}/edit`}
                                                            className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                                                            title="Edit"
                                                        >
                                                            <EditIcon />
                                                        </Link>
                                                        <button
                                                            onClick={() => setDeleteTarget(division)}
                                                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                                                            title="Delete"
                                                        >
                                                            <TrashIcon />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <Pagination links={divisions.links} />
                        </>
                    ) : (
                        <EmptyState title="No divisions yet" description="Create your first division to build the organization structure" />
                    )}
                </Card>
            </div>

            <ConfirmModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Division"
                message={`Delete division "${deleteTarget?.name}"? This will also delete all its departments and teams.`}
            />
        </AuthenticatedLayout>
    );
}
