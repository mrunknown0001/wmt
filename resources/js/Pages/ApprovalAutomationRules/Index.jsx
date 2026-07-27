import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';

// Consistent stroke-based icons (Heroicons) for the row actions.
const actionIcon = (d) => (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
    </svg>
);
const ICONS = {
    enabled: 'M9 12.75l1.5 1.5 3-3.75m6 .25a9 9 0 11-18 0 9 9 0 0118 0z',
    disabled: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    edit: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM19.5 12v6a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 18V7.5A2.25 2.25 0 016.75 5.25H12',
    delete: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.02-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
};

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
                {/* Sticky so "Create Rule" stays reachable while the list scrolls.
                    The opaque background keeps rows from showing through. */}
                <div className="sticky top-0 z-10 flex items-center justify-between bg-gray-50 dark:bg-gray-900 py-3 -my-1">
                    <div className="flex items-center gap-4">
                        <Link href={route('approval-projects.show', project.id)} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                            <span className="inline-flex items-center gap-1"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>Back</span>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                                Automation Rules ({rules?.length || 0})
                            </h1>
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
                                                    {rule.is_active ? actionIcon(ICONS.enabled) : actionIcon(ICONS.disabled)}
                                                    <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                                        {rule.is_active ? 'Disable' : 'Enable'}
                                                    </span>
                                                </button>
                                                <Link
                                                    href={route('approval-projects.automation-rules.edit', [project.id, rule.id])}
                                                    className="relative group inline-flex items-center justify-center w-8 h-8 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition"
                                                    title="Edit"
                                                >
                                                    {actionIcon(ICONS.edit)}
                                                    <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                                        Edit
                                                    </span>
                                                </Link>
                                                <button
                                                    onClick={() => handleDelete(rule)}
                                                    className="relative group inline-flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition"
                                                    title="Delete"
                                                >
                                                    {actionIcon(ICONS.delete)}
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
