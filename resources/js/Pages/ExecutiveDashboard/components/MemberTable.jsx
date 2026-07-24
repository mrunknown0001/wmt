import { Link } from '@inertiajs/react';
import Card from '../../../Components/Card';
import Avatar from '../../../Components/Avatar';

export default function MemberTable({ members }) {
    if (!members?.length) {
        return (
            <Card>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Team Members</h3>
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No members</p>
            </Card>
        );
    }

    return (
        <Card padding={false}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Team Members</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">Member</th>
                            <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Assigned</th>
                            <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Completed</th>
                            <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Active</th>
                            <th className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Overdue</th>
                            <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3 w-40">Completion</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {members.map((member) => (
                            <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                                <td className="px-6 py-3">
                                    <div className="flex items-center gap-3">
                                        <Avatar name={member.name} size="sm" />
                                        <div>
                                            <Link href={`/users/${member.id}`} className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                                {member.name}
                                            </Link>
                                            {member.position && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{member.position}</p>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="text-center text-sm text-gray-700 dark:text-gray-300 px-4 py-3">
                                    {member.assigned_tasks_count}
                                </td>
                                <td className="text-center text-sm text-green-600 dark:text-green-400 font-medium px-4 py-3">
                                    {member.completed_tasks_count}
                                </td>
                                <td className="text-center text-sm text-blue-600 dark:text-blue-400 px-4 py-3">
                                    {member.active_tasks_count}
                                </td>
                                <td className="text-center text-sm px-4 py-3">
                                    <span className={member.overdue_tasks_count > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}>
                                        {member.overdue_tasks_count}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${
                                                    member.completion_rate >= 75 ? 'bg-green-500' :
                                                    member.completion_rate >= 50 ? 'bg-yellow-500' :
                                                    member.completion_rate >= 25 ? 'bg-orange-500' : 'bg-red-500'
                                                }`}
                                                style={{ width: `${member.completion_rate}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-10 text-right">
                                            {member.completion_rate}%
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
