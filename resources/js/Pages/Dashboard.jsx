import { usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../Layouts/AuthenticatedLayout';

export default function Dashboard() {
    const { auth } = usePage().props;

    return (
        <AuthenticatedLayout title="Dashboard">
            <div className="max-w-4xl">
                <h1 className="text-2xl font-semibold text-gray-800 mb-4">Dashboard</h1>
                <div className="bg-white rounded-lg shadow p-6">
                    <p className="text-gray-600">
                        Welcome back, <span className="font-medium">{auth.user?.name}</span>.
                    </p>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-blue-50 rounded-lg p-4">
                            <p className="text-sm text-blue-600 font-medium">Role</p>
                            <p className="text-lg font-semibold text-blue-900 capitalize">
                                {auth.user?.roles?.[0]?.replace('_', ' ')}
                            </p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-4">
                            <p className="text-sm text-green-600 font-medium">Department</p>
                            <p className="text-lg font-semibold text-green-900">
                                {auth.user?.department || 'Not set'}
                            </p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-4">
                            <p className="text-sm text-purple-600 font-medium">Position</p>
                            <p className="text-lg font-semibold text-purple-900">
                                {auth.user?.position || 'Not set'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
