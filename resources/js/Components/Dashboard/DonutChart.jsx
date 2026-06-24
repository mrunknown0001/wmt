import Card from '../Card';
import { formatLabel, svgStatusColors } from '../../utils';

export default function DonutChart({ data, title = 'Tasks by Status' }) {
    const entries = Object.entries(data || {});
    const total = entries.reduce((sum, [, count]) => sum + count, 0);

    if (total === 0) {
        return (
            <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No data</p>
            </Card>
        );
    }

    const radius = 60;
    const strokeWidth = 20;
    const center = 80;
    const circumference = 2 * Math.PI * radius;

    let accumulated = 0;
    const segments = entries.map(([status, count]) => {
        const pct = count / total;
        const dashArray = circumference;
        const dashOffset = circumference - pct * circumference;
        const rotation = (accumulated / total) * 360 - 90;
        accumulated += count;
        return { status, count, pct, dashArray, dashOffset, rotation, color: svgStatusColors[status] || '#9ca3af' };
    });

    return (
        <Card>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
            <div className="flex items-center gap-6">
                <div className="relative">
                    <svg width={160} height={160} viewBox="0 0 160 160">
                        <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-gray-200 dark:text-gray-700" />
                        {segments.map((seg) => (
                            <circle
                                key={seg.status}
                                cx={center}
                                cy={center}
                                r={radius}
                                fill="none"
                                stroke={seg.color}
                                strokeWidth={strokeWidth}
                                strokeDasharray={seg.dashArray}
                                strokeDashoffset={seg.dashOffset}
                                strokeLinecap="butt"
                                transform={`rotate(${seg.rotation} ${center} ${center})`}
                            />
                        ))}
                        <text x={center} y={center - 6} textAnchor="middle" className="fill-gray-900 dark:fill-gray-100 text-2xl font-semibold" fontSize="24">{total}</text>
                        <text x={center} y={center + 12} textAnchor="middle" className="fill-gray-500 dark:fill-gray-400" fontSize="11">total</text>
                    </svg>
                </div>
                <div className="flex-1 space-y-1.5">
                    {segments.map((seg) => (
                        <div key={seg.status} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                                <span className="text-xs text-gray-600 dark:text-gray-400">{formatLabel(seg.status)}</span>
                            </div>
                            <span className="text-xs font-medium text-gray-900 dark:text-gray-100">{seg.count}</span>
                        </div>
                    ))}
                </div>
            </div>
        </Card>
    );
}
