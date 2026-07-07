import { Link } from '@inertiajs/react';
import Card from '../../../Components/Card';
import Avatar from '../../../Components/Avatar';
import PriorityBadge from '../../../Components/PriorityBadge';
import StatusBadge from '../../../Components/StatusBadge';
import { taskEditUrl } from '../../../utils';

export default function AtRiskItems({ items }) {
    if (!items?.length) {
        return (
            <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">At-Risk Items</h3>
                <p className="text-sm text-green-600 dark:text-green-400 text-center py-6">No overdue tasks</p>
            </Card>
        );
    }

    return (
        <Card padding={false}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">At-Risk Items</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Overdue tasks requiring attention</p>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-6 py-3">
                        {item.assignee && <Avatar name={item.assignee.name} size="sm" />}
                        <div className="flex-1 min-w-0">
                            <Link
                                href={taskEditUrl(item)}
                                className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400 truncate block"
                            >
                                {item.title}
                            </Link>
                            <div className="flex items-center gap-2 mt-0.5">
                                {item.project && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.project.name}</span>
                                )}
                                {item.assignee && (
                                    <span className="text-xs text-gray-400 dark:text-gray-500">{item.assignee.name}</span>
                                )}
                            </div>
                        </div>
                        <PriorityBadge priority={item.priority} />
                        <StatusBadge status={item.status} type="task" />
                        <span className="text-xs text-red-600 dark:text-red-400 whitespace-nowrap font-medium">
                            Due {item.due_date}
                        </span>
                    </div>
                ))}
            </div>
        </Card>
    );
}
