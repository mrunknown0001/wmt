export default function ProjectProgressBar({ completed, total }) {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return (
        <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{pct}%</span>
        </div>
    );
}
