import { useState } from 'react';
import Card from '../Card';
import Avatar from '../Avatar';
import PersonOpenTasks from '../PersonOpenTasks';

export default function TeamWorkload({ users }) {
    // The same list the executive chart opens: both bars count the same thing,
    // so both answer with the same query rather than two that could drift.
    const [person, setPerson] = useState(null);

    if (!users?.length) return null;

    const maxCount = Math.max(...users.map((u) => u.assigned_tasks_count), 1);

    return (
        <Card padding={false}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Team Workload</h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {users.map((user) => (
                    <button
                        key={user.id}
                        type="button"
                        onClick={() => setPerson({ id: user.id, name: user.name, count: user.assigned_tasks_count })}
                        title={`Open ${user.name}'s ${user.assigned_tasks_count} task${user.assigned_tasks_count === 1 ? '' : 's'}`}
                        className="w-full flex items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-primary-50/40 dark:hover:bg-primary-900/10 cursor-pointer"
                    >
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
                    </button>
                ))}
            </div>

            <PersonOpenTasks person={person} onClose={() => setPerson(null)} />
        </Card>
    );
}
