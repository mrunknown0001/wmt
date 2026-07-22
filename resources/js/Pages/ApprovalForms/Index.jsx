import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';

// Consistent stroke-based icons (Heroicons) for the form row actions.
const actionIcon = (d) => (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
    </svg>
);
const ICONS = {
    openLink: 'M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25',
    copy: 'M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184',
    check: 'M4.5 12.75l6 6 9-13.5',
    edit: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM19.5 12v6a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 18V7.5A2.25 2.25 0 016.75 5.25H12',
    delete: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.02-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
};

export default function Index({ project, forms }) {
    const [copiedFormId, setCopiedFormId] = useState(null);

    const handleDelete = (form) => {
        if (confirm(`Delete the form "${form.name}"?`)) {
            router.delete(route('approval-projects.forms.destroy', [project.id, form.id]), {
                onSuccess: () => {
                    // Page will be updated by Inertia automatically
                },
            });
        }
    };

    const handleCopyLink = (form) => {
        if (!form.public_url) return;

        const markCopied = () => {
            setCopiedFormId(form.id);
            setTimeout(() => setCopiedFormId(null), 2000);
        };

        // Fallback for contexts where the async Clipboard API is unavailable/blocked.
        const legacyCopy = (text) => {
            const el = document.createElement('textarea');
            el.value = text;
            el.style.position = 'fixed';
            el.style.opacity = '0';
            document.body.appendChild(el);
            el.select();
            try { document.execCommand('copy'); } catch { /* ignore */ }
            document.body.removeChild(el);
        };

        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(form.public_url)
                .then(markCopied)
                .catch(() => { legacyCopy(form.public_url); markCopied(); });
        } else {
            legacyCopy(form.public_url);
            markCopied();
        }
    };

    return (
        <AuthenticatedLayout title="Approval Forms">
            <Head title="Approval Forms" />
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href={route('approval-projects.show', project.id)} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                            <span className="inline-flex items-center gap-1"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>Back</span>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Approval Forms</h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-1">{project.name}</p>
                        </div>
                    </div>
                    <Link href={route('approval-projects.forms.create', project.id)}>
                        <Button>Create Form</Button>
                    </Link>
                </div>

                {forms && forms.data && forms.data.length > 0 ? (
                    <div className="space-y-4">
                        {forms.data.map((form) => (
                            <div key={form.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{form.name}</h3>
                                        {form.description && (
                                            <p className="text-gray-600 dark:text-gray-400 mt-1">{form.description}</p>
                                        )}
                                    </div>
                                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                                        form.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                    }`}>
                                        {form.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </div>

                                <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                                    {form.fields_count || 0} fields • {form.submissions_count || 0} submissions
                                </div>

                                <div className="flex items-center gap-2">
                                    <a
                                        href={form.public_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="relative group inline-flex items-center justify-center w-8 h-8 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                                        title="View Public Form"
                                    >
                                        {actionIcon(ICONS.openLink)}
                                        <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                            View Public Form
                                        </span>
                                    </a>
                                    <button
                                        onClick={() => handleCopyLink(form)}
                                        className="relative group inline-flex items-center justify-center w-8 h-8 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 rounded hover:bg-green-100 dark:hover:bg-green-900/30 transition"
                                        title="Copy Link"
                                    >
                                        {copiedFormId === form.id ? actionIcon(ICONS.check) : actionIcon(ICONS.copy)}
                                        <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                            {copiedFormId === form.id ? 'Copied!' : 'Copy Link'}
                                        </span>
                                    </button>
                                    <Link
                                        href={route('approval-projects.forms.edit', [project.id, form.id])}
                                        className="relative group inline-flex items-center justify-center w-8 h-8 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition"
                                        title="Edit"
                                    >
                                        {actionIcon(ICONS.edit)}
                                        <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                            Edit
                                        </span>
                                    </Link>
                                    <button
                                        onClick={() => handleDelete(form)}
                                        className="relative group inline-flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition"
                                        title="Delete"
                                    >
                                        {actionIcon(ICONS.delete)}
                                        <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-900 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                                            Delete
                                        </span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <p className="text-gray-600 dark:text-gray-400 mb-4">No forms yet</p>
                        <Link href={route('approval-projects.forms.create', project.id)}>
                            <Button>Create Your First Form</Button>
                        </Link>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
