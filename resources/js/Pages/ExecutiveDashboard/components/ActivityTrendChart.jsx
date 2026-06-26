import Card from '../../../Components/Card';

export default function ActivityTrendChart({ data }) {
    const entries = Object.entries(data || {});
    if (entries.length === 0) {
        return (
            <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Activity Trend (30 Days)</h3>
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No activity data</p>
            </Card>
        );
    }

    const maxCount = Math.max(...entries.map(([, c]) => c), 1);

    return (
        <Card>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Activity Trend (30 Days)</h3>
            <div className="flex items-end gap-0.5 h-32">
                {entries.map(([date, count]) => {
                    const height = Math.max((count / maxCount) * 100, 4);
                    const day = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    return (
                        <div key={date} className="flex-1 flex flex-col items-center justify-end group relative">
                            <div
                                className="w-full bg-primary-500 dark:bg-primary-400 rounded-t transition-all hover:bg-primary-600 dark:hover:bg-primary-300 cursor-default"
                                style={{ height: `${height}%`, minHeight: '2px' }}
                            />
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                {day}: {count}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
