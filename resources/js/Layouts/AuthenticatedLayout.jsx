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
import AiChatWidget from '../Components/AiChat/AiChatWidget';

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

const CalendarIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
    </svg>
);

const ActivityLogIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const ChartBarIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
);

const BellIcon = () => (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
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
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        try { return localStorage.getItem('sidebar_collapsed') === '1'; } catch { return false; }
    });
    const [toasts, setToasts] = useState([]);

    const toggleSidebarCollapsed = () => {
        setSidebarCollapsed((prev) => {
            const next = !prev;
            try { localStorage.setItem('sidebar_collapsed', next ? '1' : '0'); } catch {}
            return next;
        });
    };

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

    const sidebarContent = (collapsed = false) => (
        <div className="flex flex-col h-full">
            {/* Brand */}
            <div className={`flex items-center gap-2 ${collapsed ? 'justify-center px-2' : 'px-5'} py-5 border-b border-gray-700/50`}>
                <div className="h-8 w-8 bg-primary-600 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-sm">{appName.charAt(0).toUpperCase()}</span>
                </div>
                {!collapsed && <span className="text-lg font-semibold text-white tracking-tight">{appName}</span>}
            </div>

            {/* Navigation */}
            <nav className={`flex-1 ${collapsed ? 'px-2' : 'px-3'} py-4 space-y-6 overflow-y-auto`}>
                <div className="space-y-0.5">
                    <NavLink href="/dashboard" icon={<HomeIcon />} active={isActive('/dashboard')} collapsed={collapsed}>
                        Dashboard
                    </NavLink>
                    <NavLink href="/inbox" icon={<InboxIcon />} active={isActive('/inbox')} badge={unreadNotificationsCount || null} collapsed={collapsed}>
                        Inbox
                    </NavLink>
                    <NavLink href="/my-tasks" icon={<ChecklistIcon />} active={isActive('/my-tasks')} collapsed={collapsed}>
                        My Tasks
                    </NavLink>
                    <NavLink href="/calendar" icon={<CalendarIcon />} active={isActive('/calendar')} collapsed={collapsed}>
                        Calendar
                    </NavLink>
                    {(hasRole('admin') || hasRole('executive')) && (
                        <NavLink href="/executive-dashboard" icon={<ChartBarIcon />} active={isActive('/executive-dashboard')} collapsed={collapsed}>
                            Executive Dashboard
                        </NavLink>
                    )}
                </div>

                {hasPermission('view-projects') && (
                    <div className="space-y-0.5">
                        <NavLink href="/projects" icon={<FolderIcon />} active={isActive('/projects')} collapsed={collapsed}>
                            Projects
                        </NavLink>
                    </div>
                )}

                {(hasPermission('view-divisions') || hasPermission('view-departments') || hasPermission('view-teams')) && (
                    <NavSection title="Organization" collapsed={collapsed}>
                        {hasPermission('view-divisions') && (
                            <NavLink href="/divisions" icon={<BuildingIcon />} active={isActive('/divisions')} collapsed={collapsed}>
                                Divisions
                            </NavLink>
                        )}
                        {hasPermission('view-departments') && (
                            <NavLink href="/departments" icon={<SitemapIcon />} active={isActive('/departments')} collapsed={collapsed}>
                                Departments
                            </NavLink>
                        )}
                        {hasPermission('view-teams') && (
                            <NavLink href="/teams" icon={<UsersGroupIcon />} active={isActive('/teams')} collapsed={collapsed}>
                                Teams
                            </NavLink>
                        )}
                    </NavSection>
                )}

                <NavSection title="Preferences" collapsed={collapsed}>
                    <NavLink href="/settings/notifications" icon={<BellIcon />} active={isActive('/settings/notifications')} collapsed={collapsed}>
                        Notifications
                    </NavLink>
                </NavSection>

                {(hasPermission('view-users') || hasRole('admin')) && (
                    <NavSection title="Administration" collapsed={collapsed}>
                        {hasPermission('view-users') && (
                            <NavLink href="/users" icon={<UserIcon />} active={isActive('/users')} collapsed={collapsed}>
                                Users
                            </NavLink>
                        )}
                        {hasRole('admin') && (
                            <NavLink href="/activity-log" icon={<ActivityLogIcon />} active={isActive('/activity-log')} collapsed={collapsed}>
                                Activity Log
                            </NavLink>
                        )}
                        {hasRole('admin') && (
                            <NavLink href="/settings" icon={<SettingsIcon />} active={isActive('/settings')} collapsed={collapsed}>
                                Settings
                            </NavLink>
                        )}
                    </NavSection>
                )}
            </nav>

            {/* Collapse toggle (desktop only) */}
            <div className="hidden lg:block border-t border-gray-700/50 px-2 py-2">
                <button
                    onClick={toggleSidebarCollapsed}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:bg-gray-700/50 hover:text-white transition-colors text-sm"
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    <svg className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                    {!collapsed && <span>Collapse</span>}
                </button>
            </div>

            {/* User area */}
            <div className="border-t border-gray-700/50 px-4 py-3">
                <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
                    <Avatar name={auth.user?.name} size="md" />
                    {!collapsed && (
                        <>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{auth.user?.name}</p>
                                <Badge color="blue" className="mt-0.5">{auth.user?.roles?.[0]}</Badge>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="text-gray-400 hover:text-white transition-colors p-1"
                                title="Logout"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                            </button>
                        </>
                    )}
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

                {/* Sidebar — mobile (always full width) */}
                <aside
                    className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 dark:bg-gray-950 transform transition-transform lg:hidden ${
                        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
                >
                    {sidebarContent(false)}
                </aside>

                {/* Sidebar — desktop (collapsible) */}
                <aside
                    className={`hidden lg:block bg-gray-900 dark:bg-gray-950 transition-all duration-200 shrink-0 ${
                        sidebarCollapsed ? 'w-16' : 'w-64'
                    }`}
                >
                    {sidebarContent(sidebarCollapsed)}
                </aside>

                {/* Main area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Top header bar */}
                    <div className="sticky top-0 z-30 flex items-center gap-3 px-4 lg:px-8 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 lg:hidden"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        <span className="text-lg font-semibold text-gray-800 dark:text-gray-100 lg:hidden">{appName}</span>
                        <div className="flex-1" />
                        <ThemeToggle className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" />
                        <NotificationBell onToast={handleToast} />
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
                <AiChatWidget />
            </div>
        </>
    );
}
