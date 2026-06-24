import Card from '../Card';
import Avatar from '../Avatar';

export default function TeamWorkload({ users }) {
    if (!users?.length) return null;

    const maxCount = Math.max(...users.map((u) => u.assigned_tasks_count), 1);

    return (
        <Card padding={false}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Team Workload</h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {users.map((user) => (
                    <div key={user.id} className="flex items-center gap-3 px-6 py-3">
                        <Avatar name={user.name} size="sm" />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{user.name}</span>
                                <span className="text-xs font-medium text-gray-900 dark:text-gray-100 ml-2">{user.assigned_tasks_count}</span>
                            </div>
                            <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-blue-500 transition-all"
                                    style={{ width: `${(user.assigned_tasks_count / maxCount) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}
