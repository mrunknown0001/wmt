import Card from '../Card';
import { formatLabel, svgPriorityColors } from '../../utils';

export default function BarChart({ data, title = 'Tasks by Priority' }) {
    const entries = Object.entries(data || {});
    const maxCount = Math.max(...entries.map(([, c]) => c), 1);
    const total = entries.reduce((sum, [, c]) => sum + c, 0);

    if (total === 0) {
        return (
            <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No data</p>
            </Card>
        );
    }

    // Order: low, medium, high, urgent
    const order = ['low', 'medium', 'high', 'urgent'];
    const sorted = order.filter((p) => data[p] !== undefined).map((p) => [p, data[p]]);

    return (
        <Card>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h3>
            <div className="space-y-3">
                {sorted.map(([priority, count]) => (
                    <div key={priority} className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 dark:text-gray-400 w-14 text-right">{formatLabel(priority)}</span>
                        <div className="flex-1 h-7 bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden">
                            <div
                                className="h-full rounded-md flex items-center px-2 transition-all"
                                style={{
                                    width: `${Math.max((count / maxCount) * 100, 8)}%`,
                                    backgroundColor: svgPriorityColors[priority] || '#9ca3af',
                                }}
                            >
                                <span className="text-xs font-medium text-white">{count}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}
