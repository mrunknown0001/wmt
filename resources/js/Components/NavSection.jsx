export default function NavSection({ title, children }) {
    return (
        <div>
            <p className="px-3 mb-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                {title}
            </p>
            <div className="space-y-0.5">{children}</div>
        </div>
    );
}
