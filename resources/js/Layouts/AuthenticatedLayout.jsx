import { Head, router, usePage } from '@inertiajs/react';
import { useState, useCallback } from 'react';
import NavLink from '../Components/NavLink';
import NavSection from '../Components/NavSection';
import Avatar from '../Components/Avatar';
import Badge from '../Components/Badge';
import FlashMessage from '../Components/FlashMessage';
import ThemeToggle from '../Components/ThemeToggle';
import NotificationBell from '../Components/NotificationBell';
import NotificationToast from '../Components/NotificationToast';

const HomeIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
    </svg>
);

const FolderIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
);

const BuildingIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
);

const SitemapIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM9 17a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2zm-5 0a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2zm14 0a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 01-1 1h-2a1 1 0 01-1-1v-2zM12 8v4m0 0l-4 4m4-4l4 4" />
    </svg>
);

const UsersGroupIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

const UserIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
);

const InboxIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-17.399 0V5.507c0-.996.807-1.757 1.8-1.757h14.4c.993 0 1.8.761 1.8 1.757v7.993" />
    </svg>
);

const ChecklistIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
);

const SettingsIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

export default function AuthenticatedLayout({ children, title }) {
    const { auth, flash, settings, unreadNotificationsCount } = usePage().props;
    const currentUrl = usePage().url;
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [toasts, setToasts] = useState([]);

    const handleToast = useCallback((notification) => {
        setToasts((prev) => {
            // Deduplicate — two NotificationBell instances (sidebar + mobile) both fire this
            if (prev.some((t) => t.id === notification.id)) return prev;
            return [...prev, { id: notification.id, data: notification, timestamp: Date.now() }];
        });
    }, []);

    const dismissToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const hasPermission = (permission) => {
        return auth.user?.permissions?.includes(permission);
    };

    const hasRole = (role) => {
        return auth.user?.roles?.includes(role);
    };

    const appName = settings?.app_name || 'WMT';

    const isActive = (path) => {
        if (path === '/dashboard') return currentUrl === '/dashboard';
        return currentUrl.startsWith(path);
    };

    const handleLogout = (e) => {
        e.preventDefault();
        router.post('/logout');
    };

    const sidebarContent = (
        <div className="flex flex-col h-full">
            {/* Brand */}
            <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-700/50">
                <div className="h-8 w-8 bg-primary-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">{appName.charAt(0).toUpperCase()}</span>
                </div>
                <span className="text-lg font-semibold text-white tracking-tight">{appName}</span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
                <div className="space-y-0.5">
                    <NavLink href="/dashboard" icon={<HomeIcon />} active={isActive('/dashboard')}>
                        Dashboard
                    </NavLink>
                    <NavLink href="/inbox" icon={<InboxIcon />} active={isActive('/inbox')} badge={unreadNotificationsCount || null}>
                        Inbox
                    </NavLink>
                    <NavLink href="/my-tasks" icon={<ChecklistIcon />} active={isActive('/my-tasks')}>
                        My Tasks
                    </NavLink>
                </div>

                {hasPermission('view-projects') && (
                    <div className="space-y-0.5">
                        <NavLink href="/projects" icon={<FolderIcon />} active={isActive('/projects')}>
                            Projects
                        </NavLink>
                    </div>
                )}

                {(hasPermission('view-divisions') || hasPermission('view-departments') || hasPermission('view-teams')) && (
                    <NavSection title="Organization">
                        {hasPermission('view-divisions') && (
                            <NavLink href="/divisions" icon={<BuildingIcon />} active={isActive('/divisions')}>
                                Divisions
                            </NavLink>
                        )}
                        {hasPermission('view-departments') && (
                            <NavLink href="/departments" icon={<SitemapIcon />} active={isActive('/departments')}>
                                Departments
                            </NavLink>
                        )}
                        {hasPermission('view-teams') && (
                            <NavLink href="/teams" icon={<UsersGroupIcon />} active={isActive('/teams')}>
                                Teams
                            </NavLink>
                        )}
                    </NavSection>
                )}

                {(hasPermission('view-users') || hasRole('admin')) && (
                    <NavSection title="Administration">
                        {hasPermission('view-users') && (
                            <NavLink href="/users" icon={<UserIcon />} active={isActive('/users')}>
                                Users
                            </NavLink>
                        )}
                        {hasRole('admin') && (
                            <NavLink href="/settings" icon={<SettingsIcon />} active={isActive('/settings')}>
                                Settings
                            </NavLink>
                        )}
                    </NavSection>
                )}
            </nav>

            {/* User area */}
            <div className="border-t border-gray-700/50 px-4 py-3">
                <div className="flex items-center gap-3">
                    <Avatar name={auth.user?.name} size="md" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{auth.user?.name}</p>
                        <Badge color="blue" className="mt-0.5">{auth.user?.roles?.[0]}</Badge>
                    </div>
                    <ThemeToggle className="text-gray-400 hover:text-white" />
                    <NotificationBell onToast={handleToast} />
                    <button
                        onClick={handleLogout}
                        className="text-gray-400 hover:text-white transition-colors p-1"
                        title="Logout"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <>
            <Head title={title} />
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
                {/* Mobile backdrop */}
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* Sidebar */}
                <aside
                    className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 dark:bg-gray-950 transform transition-transform lg:translate-x-0 lg:static lg:z-auto ${
                        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
                >
                    {sidebarContent}
                </aside>

                {/* Main area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Mobile header */}
                    <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        <span className="text-lg font-semibold text-gray-800 dark:text-gray-100">{appName}</span>
                        <div className="ml-auto">
                            <NotificationBell onToast={handleToast} />
                        </div>
                    </div>

                    {/* Content */}
                    <main className="flex-1 px-8 py-6">
                        {children}
                    </main>
                </div>

                {/* Flash messages */}
                {flash?.success && <FlashMessage type="success" message={flash.success} />}
                {flash?.error && <FlashMessage type="error" message={flash.error} />}
                <NotificationToast toasts={toasts} onDismiss={dismissToast} />
            </div>
        </>
    );
}
