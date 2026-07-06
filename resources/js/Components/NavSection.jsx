export default function NavSection({ title, collapsed = false, children }) {
    return (
        <div>
            {!collapsed && (
                <div className="flex items-center gap-2 px-3 mb-1.5">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {title}
                    </p>
                    <div className="flex-1 h-px bg-gray-700/30" />
                </div>
            )}
            {collapsed && (
                <div className="mx-3 mb-1 border-t border-gray-700/50" />
            )}
            <div className="space-y-0.5">{children}</div>
        </div>
    );
}
