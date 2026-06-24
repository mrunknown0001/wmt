import { Link, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';

export default function Index() {
    const { teams, auth } = usePage().props;
    const canManage = auth.user?.permissions?.includes('manage-teams');

    const handleDelete = (id, name) => {
        if (confirm(`Delete team "${name}"?`)) {
            router.delete(`/teams/${id}`);
        }
    };

    return (
        <AuthenticatedLayout title="Teams">
            <div className="max-w-6xl">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-semibold text-gray-800">Teams</h1>
                    {canManage && (
                        <Link
                            href="/teams/create"
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
                        >
                            Add Team
                        </Link>
                    )}
                </div>

                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Division</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leader</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Members</th>
                                {canManage && (
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {teams.data.map((team) => (
                                <tr key={team.id}>
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{team.name}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{team.department?.name || '—'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{team.department?.division?.name || '—'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{team.leader?.name || '—'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{team.members_count}</td>
                                    {canManage && (
                                        <td className="px-6 py-4 text-sm text-right space-x-2">
                                            <Link href={`/teams/${team.id}/edit`} className="text-blue-600 hover:text-blue-800">
                                                Edit
                                            </Link>
                                            <button onClick={() => handleDelete(team.id, team.name)} className="text-red-600 hover:text-red-800">
                                                Delete
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            {teams.data.length === 0 && (
                                <tr>
                                    <td colSpan={canManage ? 6 : 5} className="px-6 py-4 text-center text-sm text-gray-500">
                                        No teams found.
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
