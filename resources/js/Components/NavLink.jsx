import { Link } from '@inertiajs/react';

export default function NavLink({ href, icon, active = false, badge, collapsed = false, children }) {
    return (
        <Link
            href={href}
            title={collapsed ? children : undefined}
            className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                collapsed ? 'justify-center' : ''
            } ${
                active
                    ? 'bg-gray-700/70 text-white'
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
        </Link>
    );
}
