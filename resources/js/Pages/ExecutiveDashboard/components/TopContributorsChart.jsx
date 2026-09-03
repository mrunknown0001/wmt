import Card from '../../../Components/Card';
import Avatar from '../../../Components/Avatar';
import { formatMinutes } from '../../../utils';

export default function TopContributorsChart({ data }) {
    if (!data?.length) {
        return (
            <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Top Contributors</h3>
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No data</p>
            </Card>
        );
    }

    const maxCount = Math.max(...data.map((d) => d.count), 1);

    return (
        <Card>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Top Contributors</h3>
            <div className="space-y-2.5">
                {data.map((user) => (
                    <div key={user.user_id} className="flex items-center gap-3">
                        <Avatar name={user.name} size="sm" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 w-28 truncate">{user.name}</span>
                        <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                            <div
                                className="h-full bg-green-500 dark:bg-green-400 rounded flex items-center px-2 transition-all"
                                style={{ width: `${Math.max((user.count / maxCount) * 100, 8)}%` }}
                            >
                                <span className="text-xs font-medium text-white">{user.count}</span>
                            </div>
                        </div>
                        {/* Hours beside the count, because a count alone treats a
                            five-minute task and a three-day one alike. A dash
                            where nothing was logged: zero would read as "spent
                            no time", which is not what an empty log means. */}
                        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">
                            {user.minutes > 0 ? formatMinutes(user.minutes) : '—'}
                        </span>
                    </div>
                ))}
            </div>
        </Card>
    );
}
