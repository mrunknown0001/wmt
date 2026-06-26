export default function NavSection({ title, collapsed = false, children }) {
    return (
        <div>
            {!collapsed && (
                <p className="px-3 mb-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    {title}
                </p>
            )}
            {collapsed && (
                <div className="mx-3 mb-1 border-t border-gray-700/50" />
            )}
            <div className="space-y-0.5">{children}</div>
        </div>
    );
}
