import Card from '../../../Components/Card';
import Avatar from '../../../Components/Avatar';

export default function WorkloadChart({ data }) {
    if (!data?.length) {
        return (
            <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Workload Distribution</h3>
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No active tasks</p>
            </Card>
        );
    }

    const maxCount = Math.max(...data.map((d) => d.active_tasks_count), 1);

    return (
        <Card>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Workload Distribution</h3>
            <div className="space-y-2.5">
                {data.map((user) => (
                    <div key={user.id} className="flex items-center gap-3">
                        <Avatar name={user.name} size="sm" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 w-28 truncate">{user.name}</span>
                        <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                            <div
                                className="h-full bg-blue-500 dark:bg-blue-400 rounded flex items-center px-2 transition-all"
                                style={{ width: `${Math.max((user.active_tasks_count / maxCount) * 100, 8)}%` }}
                            >
                                <span className="text-xs font-medium text-white">{user.active_tasks_count}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}
