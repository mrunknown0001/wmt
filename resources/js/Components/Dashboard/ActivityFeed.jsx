import { Link } from '@inertiajs/react';
import Card from '../Card';
import Avatar from '../Avatar';
import { timeAgo, formatLabel } from '../../utils';

export default function ActivityFeed({ activities }) {
    if (!activities?.length) return null;

    return (
        <Card padding={false}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Recent Activity</h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {activities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 px-6 py-3">
                        <Avatar name={activity.user?.name || '?'} size="sm" className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                <span className="font-medium">{activity.user?.name || 'Someone'}</span>
                                {' '}
                                {activity.description || (
                                    <>
                                        changed <span className="font-medium">{formatLabel(activity.field)}</span>
                                        {activity.old_value && (
                                            <> from <span className="text-gray-500">{formatLabel(activity.old_value)}</span></>
                                        )}
                                        {activity.new_value && (
                                            <> to <span className="font-medium">{formatLabel(activity.new_value)}</span></>
                                        )}
                                    </>
                                )}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                                {activity.task && (
                                    <Link
                                        href={`/projects/${activity.task.project_id}/tasks/${activity.task.id}/edit`}
                                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
                                    >
                                        {activity.task.title}
                                    </Link>
                                )}
                                <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                                    {timeAgo(activity.created_at)}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}
