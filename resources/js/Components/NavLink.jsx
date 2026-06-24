import { Link } from '@inertiajs/react';

export default function NavLink({ href, icon, active = false, badge, children }) {
    return (
        <Link
            href={href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                    ? 'bg-gray-700/70 text-white'
                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
            }`}
        >
            {icon && <span className="shrink-0 h-5 w-5">{icon}</span>}
            <span className="flex-1">{children}</span>
            {badge > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full h-5 min-w-5 flex items-center justify-center px-1">
                    {badge > 99 ? '99+' : badge}
                </span>
            )}
        </Link>
    );
}
