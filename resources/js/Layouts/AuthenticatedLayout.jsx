import { Head, Link, router, usePage } from '@inertiajs/react';
import { useState } from 'react';

export default function AuthenticatedLayout({ children, title }) {
    const { auth, flash } = usePage().props;
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const hasPermission = (permission) => {
        return auth.user?.permissions?.includes(permission);
    };

    const handleLogout = (e) => {
        e.preventDefault();
        router.post('/logout');
    };

    return (
        <>
            <Head title={title} />
            <div className="min-h-screen bg-gray-100">
                {/* Top navbar */}
                <nav className="bg-white border-b border-gray-200">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex justify-between h-16">
                            <div className="flex items-center">
                                <button
                                    onClick={() => setSidebarOpen(!sidebarOpen)}
                                    className="lg:hidden p-2 rounded-md text-gray-500 hover:text-gray-700"
                                >
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                    </svg>
                                </button>
                                <Link href="/dashboard" className="text-xl font-bold text-gray-800 ml-2">
                                    WMT
                                </Link>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="text-sm text-gray-600">
                                    <span className="font-medium">{auth.user?.name}</span>
                                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                        {auth.user?.roles?.[0]}
                                    </span>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="text-sm text-gray-500 hover:text-gray-700"
                                >
                                    Logout
                                </button>
                            </div>
                        </div>
                    </div>
                </nav>

                <div className="flex">
                    {/* Sidebar */}
                    <aside className={`${sidebarOpen ? 'block' : 'hidden'} lg:block w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-4rem)]`}>
                        <nav className="p-4 space-y-4">
                            <div className="space-y-1">
                                <Link
                                    href="/dashboard"
                                    className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Dashboard
                                </Link>
                            </div>

                            {(hasPermission('view-divisions') || hasPermission('view-departments') || hasPermission('view-teams')) && (
                                <div>
                                    <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Organization</p>
                                    <div className="mt-1 space-y-1">
                                        {hasPermission('view-divisions') && (
                                            <Link
                                                href="/divisions"
                                                className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                            >
                                                Divisions
                                            </Link>
                                        )}
                                        {hasPermission('view-departments') && (
                                            <Link
                                                href="/departments"
                                                className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                            >
                                                Departments
                                            </Link>
                                        )}
                                        {hasPermission('view-teams') && (
                                            <Link
                                                href="/teams"
                                                className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                            >
                                                Teams
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            )}

                            {hasPermission('view-users') && (
                                <div>
                                    <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Administration</p>
                                    <div className="mt-1 space-y-1">
                                        <Link
                                            href="/users"
                                            className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                        >
                                            Users
                                        </Link>
                                    </div>
                                </div>
                            )}
                        </nav>
                    </aside>

                    {/* Main content */}
                    <main className="flex-1 p-6">
                        {flash?.success && (
                            <div className="mb-4 p-3 rounded bg-green-50 border border-green-200 text-green-800 text-sm">
                                {flash.success}
                            </div>
                        )}
                        {flash?.error && (
                            <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-800 text-sm">
                                {flash.error}
                            </div>
                        )}
                        {children}
                    </main>
                </div>
            </div>
        </>
    );
}
