import { Head, Link } from '@inertiajs/react';
import { useState } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';
import CustomFieldManager from '../../Components/CustomFieldManager';
import ApprovalSectionManager from '../../Components/ApprovalSectionManager';

const tabs = [
    { id: 'overview', label: 'Overview', icon: 'ℹ️' },
    { id: 'chains', label: 'Chains', icon: '🔗', href: (pid) => route('approval-projects.chains.index', pid) },
    { id: 'items', label: 'Items', href: (pid) => route('approval-projects.items.index', pid) },
    { id: 'forms', label: 'Forms', icon: '📋', href: (pid) => route('approval-projects.forms.index', pid) },
    { id: 'automation', label: 'Automation', icon: '⚡', href: (pid) => route('approval-projects.automation-rules.index', pid) },
];

export default function Show({ project }) {
    const [activeTab, setActiveTab] = useState('overview');

    if (!project) {
        return (
            <AuthenticatedLayout title="Project Not Found">
                <Head title="Project Not Found" />
                <div className="text-center py-12">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Approval Project Not Found</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">The approval project you're looking for doesn't exist or you don't have access to it.</p>
                    <Link href={route('approval-projects.index')}>
                        <Button>Back to Projects</Button>
                    </Link>
                </div>
            </AuthenticatedLayout>
        );
    }

    return (
        <AuthenticatedLayout title={project.name}>
            <Head title={project.name} />
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={route('approval-projects.index')} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                            <span className="inline-flex items-center gap-1"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>Back</span>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{project.name}</h1>
                            {project.description && (
                                <p className="text-gray-600 dark:text-gray-400 mt-1">{project.description}</p>
                            )}
                        </div>
                    </div>
                    <Link href={route('approval-projects.edit', project.id)}>
                        <Button>Edit</Button>
                    </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</h3>
                        <p className={`text-2xl font-bold mt-2 ${
                            project.status === 'active'
                                ? 'text-green-600'
                                : project.status === 'on_hold'
                                ? 'text-yellow-600'
                                : 'text-gray-600'
                        }`}>
                            {project.status.replace('_', ' ').charAt(0).toUpperCase() + project.status.replace('_', ' ').slice(1)}
                        </p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Owner</h3>
                        <p className="text-2xl font-bold mt-2 dark:text-white">{project.owner?.name || 'Unassigned'}</p>
                        {(() => {
                            const coOwners = (project.members || []).filter((m) => m.pivot?.role === 'co-owner');
                            return coOwners.length > 0 ? (
                                <div className="mt-3">
                                    <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400">Co-owners</h3>
                                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">
                                        {coOwners.map((m) => m.name).join(', ')}
                                    </p>
                                </div>
                            ) : null;
                        })()}
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Due Date</h3>
                        <p className="text-2xl font-bold mt-2 dark:text-white">
                            {project.due_date ? new Date(project.due_date).toLocaleDateString() : 'No due date'}
                        </p>
                    </div>
                </div>

                {/* Tabs Navigation */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                    <div className="border-b border-gray-200 dark:border-gray-700">
                        <div className="flex gap-4 px-6 py-0">
                            {tabs.map(tab => (
                                tab.href ? (
                                    <Link
                                        key={tab.id}
                                        href={tab.href(project.id)}
                                        className={`px-4 py-4 font-medium border-b-2 transition ${
                                            activeTab === tab.id
                                                ? 'border-blue-600 text-blue-600'
                                                : 'border-transparent text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                                        }`}
                                    >
                                        {tab.label}
                                    </Link>
                                ) : (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`px-4 py-4 font-medium border-b-2 transition ${
                                            activeTab === tab.id
                                                ? 'border-blue-600 text-blue-600'
                                                : 'border-transparent text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                )
                            ))}
                        </div>
                    </div>

                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <ApprovalSectionManager
                                        projectId={project.id}
                                        initialSections={project.sections || []}
                                    />
                                </div>

                                <div>
                                    {/* Full manager (add/edit/delete/reorder) rather than a
                                        read-only list — it talks to the approval project's
                                        own custom-field endpoints. */}
                                    <CustomFieldManager
                                        projectId={project.id}
                                        baseUrl={`/approval-projects/${project.id}/custom-fields`}
                                        initialFields={project.custom_fields || project.customFields || []}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <Link href={route('approval-projects.chains.index', project.id)}>
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800 transition cursor-pointer">
                                        <p className="font-semibold text-blue-900 dark:text-blue-100">Approval Chains</p>
                                        <p className="text-sm text-blue-700 dark:text-blue-200">Configure workflow steps</p>
                                    </div>
                                </Link>
                                <Link href={route('approval-projects.forms.index', project.id)}>
                                    <div className="p-4 bg-green-50 dark:bg-green-900 rounded-lg hover:bg-green-100 dark:hover:bg-green-800 transition cursor-pointer">
                                        <p className="font-semibold text-green-900 dark:text-green-100">Forms</p>
                                        <p className="text-sm text-green-700 dark:text-green-200">Create public intake forms</p>
                                    </div>
                                </Link>
                                <Link href={route('approval-projects.automation-rules.index', project.id)}>
                                    <div className="p-4 bg-purple-50 dark:bg-purple-900 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-800 transition cursor-pointer">
                                        <p className="font-semibold text-purple-900 dark:text-purple-100">Automation</p>
                                        <p className="text-sm text-purple-700 dark:text-purple-200">Set up automation rules</p>
                                    </div>
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
