import { useEffect, useRef } from 'react';

export default function ProjectProgressBar({ completed, total }) {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const barRef = useRef(null);

    useEffect(() => {
        const el = barRef.current;
        if (!el) return;
        // Start at 0 width, animate to target
        el.style.width = '0%';
        requestAnimationFrame(() => {
            el.style.width = `${pct}%`;
        });
    }, [pct]);

    const barColor = pct === 100
        ? 'bg-green-500'
        : pct >= 60
            ? 'bg-emerald-500'
            : pct >= 30
                ? 'bg-blue-500'
                : 'bg-blue-400';

    return (
        <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                    ref={barRef}
                    className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{pct}%</span>
        </div>
    );
}
