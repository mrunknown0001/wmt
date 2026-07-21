import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';

export default function Index({ project, rules }) {
    const handleDelete = (rule) => {
        if (confirm(`Delete the rule "${rule.name}"?`)) {
            router.delete(route('approval-projects.automation-rules.destroy', [project.id, rule.id]), {
                onSuccess: () => {
                    // Page will be updated by Inertia automatically
                },
            });
        }
    };

    const handleToggle = (rule) => {
        router.patch(route('approval-projects.automation-rules.toggle', [project.id, rule.id]), {}, {
            onSuccess: () => {
                // Page will be updated by Inertia automatically
            },
        });
    };

    return (
        <AuthenticatedLayout title="Automation Rules">
            <Head title="Automation Rules" />
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={route('approval-projects.show', project.id)} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                            ← Back
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Automation Rules</h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-1">{project.name}</p>
                        </div>
                    </div>
                    <Link href={route('approval-projects.automation-rules.create', project.id)}>
                        <Button>Create Rule</Button>
                    </Link>
                </div>

                {rules && rules.length > 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Name</th>
                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Trigger</th>
                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Actions</th>
                                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">Status</th>
                                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">Options</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {rules.map((rule) => (
                                    <tr key={rule.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                                        <td className="px-6 py-4">
                                            <p className="font-medium text-gray-900 dark:text-white">{rule.name}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                                {rule.trigger_type.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                                {rule.actions?.length || 0} action(s)
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                                rule.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                            }`}>
                                                {rule.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                <button
                                                    onClick={() => handleToggle(rule)}
                                                    className="relative group inline-flex items-center justify-center w-8 h-8 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                                                    title={rule.is_active ? 'Disable' : 'Enable'}
                                                >
                                                    {rule.is_active ? '✓' : '○'}
                                                    <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                                        {rule.is_active ? 'Disable' : 'Enable'}
                                                    </span>
                                                </button>
                                                <Link
                                                    href={route('approval-projects.automation-rules.edit', [project.id, rule.id])}
                                                    className="relative group inline-flex items-center justify-center w-8 h-8 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition"
                                                    title="Edit"
                                                >
                                                    ✎
                                                    <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                                        Edit
                                                    </span>
                                                </Link>
                                                <button
                                                    onClick={() => handleDelete(rule)}
                                                    className="relative group inline-flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition"
                                                    title="Delete"
                                                >
                                                    🗑️
                                                    <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                                        Delete
                                                    </span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <p className="text-gray-600 dark:text-gray-400 mb-4">No automation rules yet</p>
                        <Link href={route('approval-projects.automation-rules.create', project.id)}>
                            <Button>Create Your First Rule</Button>
                        </Link>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
