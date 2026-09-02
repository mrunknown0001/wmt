import { useState } from 'react';
import Card from '../../../Components/Card';
import Avatar from '../../../Components/Avatar';
import PersonOpenTasks from '../../../Components/PersonOpenTasks';

/**
 * Who is carrying how much, and — on a click — what exactly.
 *
 * The bar counts somebody's open tasks. That number invites one question, so
 * each bar opens the list behind it.
 *
 * Note this is a count of tasks, not of hours: the Workload page measures time
 * from estimates, this measures how many things somebody is holding. The two
 * pages answer different questions and their numbers are not comparable.
 */
export default function WorkloadChart({ data }) {
    const [person, setPerson] = useState(null);

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
        <>
            <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Workload Distribution</h3>
                <div className="space-y-2.5">
                    {data.map((user) => (
                        <button
                            key={user.id}
                            type="button"
                            onClick={() => setPerson({ id: user.id, name: user.name, count: user.active_tasks_count })}
                            className="w-full flex items-center gap-3 rounded-lg px-1 py-0.5 -mx-1 text-left transition-all hover:ring-1 hover:ring-primary-300 dark:hover:ring-primary-600 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 cursor-pointer"
                            title={`Open ${user.name}'s ${user.active_tasks_count} task${user.active_tasks_count === 1 ? '' : 's'}`}
                        >
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
                        </button>
                    ))}
                </div>
            </Card>

            <PersonOpenTasks person={person} onClose={() => setPerson(null)} />
        </>
    );
}
