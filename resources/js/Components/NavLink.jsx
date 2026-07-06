import { Link } from '@inertiajs/react';

export default function NavLink({ href, icon, active = false, badge, collapsed = false, children }) {
    return (
        <Link
            href={href}
            className={`group/nav relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                collapsed ? 'justify-center' : ''
            } ${
                active
                    ? 'bg-gray-700/70 text-white nav-active-bar'
                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
            }`}
        >
            {icon && <span className="shrink-0 h-5 w-5">{icon}</span>}
            {!collapsed && <span className="flex-1">{children}</span>}
            {!collapsed && badge > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full h-5 min-w-5 flex items-center justify-center px-1">
                    {badge > 99 ? '99+' : badge}
                </span>
            )}
            {collapsed && badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-0.5">
                    {badge > 99 ? '99+' : badge}
                </span>
            )}
            {/* Collapsed sidebar tooltip */}
            {collapsed && (
                <span className="absolute left-full ml-2 px-2.5 py-1 rounded-md bg-gray-800 text-white text-xs font-medium whitespace-nowrap shadow-lg border border-gray-700 opacity-0 pointer-events-none group-hover/nav:opacity-100 animate-tooltip z-50 transition-opacity duration-150">
                    {children}
                </span>
            )}
        </Link>
    );
}
