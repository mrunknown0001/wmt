import Card from '../Card';
import Tooltip from '../Tooltip';
import { formatLabel, svgStatusColors } from '../../utils';

export default function TaskStatsBar({ taskStats }) {
    const { completedThisWeek, dueToday, byStatus } = taskStats;
    const total = Object.values(byStatus).reduce((sum, c) => sum + c, 0);

    return (
        <Card>
            <div className="flex items-center gap-6 mb-3">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
                        <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{completedThisWeek}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Completed this week</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 flex items-center justify-center">
                        <svg className="h-4 w-4 text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{dueToday}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Due today</p>
                    </div>
                </div>
            </div>
            {total > 0 && (
                <>
                    <div className="flex h-3 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                        {Object.entries(byStatus).map(([status, count]) => (
                                <Tooltip key={status} content={`${formatLabel(status)}: ${count}`}>
                                <div
                                    style={{ width: `${(count / total) * 100}%`, backgroundColor: svgStatusColors[status] }}
                                    className="transition-all h-full"
                                />
                                </Tooltip>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2">
                        {Object.entries(byStatus).map(([status, count]) => (
                            <div key={status} className="flex items-center gap-1.5">
                                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: svgStatusColors[status] }} />
                                <span className="text-xs text-gray-500 dark:text-gray-400">{formatLabel(status)} ({count})</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </Card>
    );
}
