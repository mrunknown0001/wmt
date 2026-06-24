import { Link, useForm, usePage } from '@inertiajs/react';
import { useMemo } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';

export default function Edit() {
    const { user, roles, currentRole, departments, teams } = usePage().props;

    const { data, setData, put, processing, errors } = useForm({
        name: user.name || '',
        email: user.email || '',
        password: '',
        password_confirmation: '',
        department_id: user.department_id || '',
        team_id: user.team_id || '',
        position: user.position || '',
        is_active: user.is_active ?? true,
        role: currentRole || 'user',
    });

    const filteredTeams = useMemo(() => {
        if (!data.department_id) return [];
        return teams.filter((t) => t.department_id === Number(data.department_id));
    }, [data.department_id, teams]);

    const handleDepartmentChange = (value) => {
        setData((prev) => ({ ...prev, department_id: value, team_id: '' }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        put(`/users/${user.id}`);
    };

    return (
        <AuthenticatedLayout title="Edit User">
            <div className="max-w-2xl">
                <div className="flex items-center gap-4 mb-4">
                    <Link href="/users" className="text-gray-500 hover:text-gray-700">&larr; Back</Link>
                    <h1 className="text-2xl font-semibold text-gray-800">Edit User</h1>
                </div>

                <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
                        <input
                            id="name"
                            type="text"
                            value={data.name}
                            onChange={(e) => setData('name', e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                    </div>

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={data.email}
                            onChange={(e) => setData('email', e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                                Password <span className="text-gray-400">(leave blank to keep)</span>
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={data.password}
                                onChange={(e) => setData('password', e.target.value)}
                                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
                        </div>
                        <div>
                            <label htmlFor="password_confirmation" className="block text-sm font-medium text-gray-700">Confirm Password</label>
                            <input
                                id="password_confirmation"
                                type="password"
                                value={data.password_confirmation}
                                onChange={(e) => setData('password_confirmation', e.target.value)}
                                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="department_id" className="block text-sm font-medium text-gray-700">Department</label>
                            <select
                                id="department_id"
                                value={data.department_id}
                                onChange={(e) => handleDepartmentChange(e.target.value)}
                                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                                <option value="">— None —</option>
                                {departments.map((dept) => (
                                    <option key={dept.id} value={dept.id}>
                                        {dept.name} ({dept.division?.name})
                                    </option>
                                ))}
                            </select>
                            {errors.department_id && <p className="mt-1 text-sm text-red-600">{errors.department_id}</p>}
                        </div>
                        <div>
                            <label htmlFor="team_id" className="block text-sm font-medium text-gray-700">Team</label>
                            <select
                                id="team_id"
                                value={data.team_id}
                                onChange={(e) => setData('team_id', e.target.value || '')}
                                disabled={!data.department_id}
                                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                            >
                                <option value="">— None —</option>
                                {filteredTeams.map((team) => (
                                    <option key={team.id} value={team.id}>{team.name}</option>
                                ))}
                            </select>
                            {errors.team_id && <p className="mt-1 text-sm text-red-600">{errors.team_id}</p>}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="position" className="block text-sm font-medium text-gray-700">Position</label>
                        <input
                            id="position"
                            type="text"
                            value={data.position}
                            onChange={(e) => setData('position', e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {errors.position && <p className="mt-1 text-sm text-red-600">{errors.position}</p>}
                    </div>

                    <div>
                        <label htmlFor="role" className="block text-sm font-medium text-gray-700">Role</label>
                        <select
                            id="role"
                            value={data.role}
                            onChange={(e) => setData('role', e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            {roles.map((role) => (
                                <option key={role} value={role} className="capitalize">
                                    {role.replace('_', ' ')}
                                </option>
                            ))}
                        </select>
                        {errors.role && <p className="mt-1 text-sm text-red-600">{errors.role}</p>}
                    </div>

                    <div className="flex items-center">
                        <input
                            id="is_active"
                            type="checkbox"
                            checked={data.is_active}
                            onChange={(e) => setData('is_active', e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">Active</label>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <Link href="/users" className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                            Cancel
                        </Link>
                        <button
                            type="submit"
                            disabled={processing}
                            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                            {processing ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </AuthenticatedLayout>
    );
}
