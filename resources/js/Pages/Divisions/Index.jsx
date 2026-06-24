import { Link, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';

export default function Index() {
    const { divisions, auth } = usePage().props;
    const canManage = auth.user?.permissions?.includes('manage-divisions');

    const handleDelete = (id, name) => {
        if (confirm(`Delete division "${name}"? This will also delete all its departments and teams.`)) {
            router.delete(`/divisions/${id}`);
        }
    };

    return (
        <AuthenticatedLayout title="Divisions">
            <div className="max-w-6xl">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-semibold text-gray-800">Divisions</h1>
                    {canManage && (
                        <Link
                            href="/divisions/create"
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
                        >
                            Add Division
                        </Link>
                    )}
                </div>

                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Head</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Departments</th>
                                {canManage && (
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {divisions.data.map((division) => (
                                <tr key={division.id}>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{division.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{division.description || '—'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{division.head?.name || '—'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{division.departments_count}</td>
                                    {canManage && (
                                        <td className="px-6 py-4 text-sm text-right space-x-2">
                                            <Link href={`/divisions/${division.id}/edit`} className="text-blue-600 hover:text-blue-800">
                                                Edit
                                            </Link>
                                            <button onClick={() => handleDelete(division.id, division.name)} className="text-red-600 hover:text-red-800">
                                                Delete
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {divisions.data.length === 0 && (
                                <tr>
                                    <td colSpan={canManage ? 5 : 4} className="px-6 py-4 text-center text-sm text-gray-500">
                                        No divisions found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
