import { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import EmptyState from '../../Components/EmptyState';
import StatusBadge from '../../Components/StatusBadge';
import { formatDate } from '../../utils';

/**
 * The labels people have used, and everything filed under the one chosen.
 *
 * Two columns because they answer two halves of the same question: which words
 * are in use, and what is under this one. Choosing a label from the left fills
 * the right — and arriving from a chip elsewhere in the app lands with it
 * already chosen, which is the whole reason this page exists.
 */
export default function TagsIndex({ tags = [], filter = '', selected = null, results = null }) {
    const [q, setQ] = useState(filter);

    const go = (value) => router.get('/tags', value ? { q: value } : {}, {
        preserveState: true,
        preserveScroll: true,
    });

    const submit = (e) => {
        e.preventDefault();
        go(q.trim());
    };

    const sections = results
        ? [
            { key: 'projects', label: 'Projects', ...results.projects },
            { key: 'tasks', label: 'Tasks', ...results.tasks },
            { key: 'minutes', label: 'Meeting minutes', ...results.minutes },
        ].filter((s) => s.total > 0)
        : [];

    const found = sections.reduce((n, s) => n + s.total, 0);

    return (
        <AuthenticatedLayout title="Tags">
            <Head title={selected ? `Tag: ${selected.name}` : 'Tags'} />

            <div className="py-6">
                <PageHeader
                    title={selected ? selected.name : 'Tags'}
                    description={selected
                        ? `Everything filed under ${selected.name} that you can see.`
                        : 'The labels in use across projects, tasks and meeting minutes. Choose one to see what carries it.'}
                    breadcrumbs={selected
                        ? [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Tags', href: '/tags' }, { label: selected.name }]
                        : [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Tags' }]}
                />

                <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-6">
                    {/* The vocabulary. Filtering it is the same box that opens a
                        label, because typing the name of one is the commonest
                        way of asking for it. */}
                    <Card className="h-fit">
                        <form onSubmit={submit} className="mb-3">
                            <input
                                type="text"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                onBlur={() => q.trim() !== filter && go(q.trim())}
                                placeholder="Filter tags…"
                                className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5 px-2.5"
                            />
                        </form>

                        {tags.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {filter ? 'No tag by that name.' : 'Nothing has been tagged yet.'}
                            </p>
                        ) : (
                            <ul className="space-y-0.5 max-h-[32rem] overflow-auto">
                                {tags.map((tag) => (
                                    <li key={tag.id}>
                                        <button
                                            type="button"
                                            onClick={() => { setQ(tag.name); go(tag.name); }}
                                            className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                                                selected?.slug === tag.slug
                                                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                                                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                            }`}
                                        >
                                            <span className="truncate">{tag.name}</span>
                                            <span className="shrink-0 text-xs text-gray-400">{tag.uses}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    <div className="min-w-0">
                        {!selected ? (
                            <Card>
                                <EmptyState
                                    illustration="search"
                                    title={tags.length ? 'Choose a tag' : 'No tags yet'}
                                    description={tags.length
                                        ? 'Pick a label on the left to see the projects, tasks and minutes filed under it.'
                                        : 'Add a tag on a project, a task or a set of minutes and it will appear here.'}
                                />
                            </Card>
                        ) : found === 0 ? (
                            <Card>
                                <EmptyState
                                    illustration="search"
                                    title={`Nothing you can see is tagged ${selected.name}`}
                                    description="The label is in use, but not on anything visible to you."
                                />
                            </Card>
                        ) : (
                            <div className="space-y-6">
                                {sections.map((section) => (
                                    <Card key={section.key} className="p-0 overflow-hidden">
                                        <div className="flex items-baseline justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{section.label}</h3>
                                            <span className="text-xs text-gray-400">
                                                {section.rows.length < section.total
                                                    ? `showing ${section.rows.length} of ${section.total}`
                                                    : section.total}
                                            </span>
                                        </div>

                                        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {section.rows.map((row) => (
                                                <li key={`${section.key}-${row.id}`}>
                                                    <Link
                                                        href={row.url}
                                                        className="flex items-start justify-between gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                                                    >
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                                                {row.name || row.title}
                                                            </p>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                                {[
                                                                    row.series_number,
                                                                    row.project_name,
                                                                    row.task_title,
                                                                    row.assignee,
                                                                    row.owner && `Owner: ${row.owner}`,
                                                                    row.meeting_date && formatDate(row.meeting_date),
                                                                ].filter(Boolean).join(' · ')}
                                                            </p>
                                                            {row.tags?.length > 1 && (
                                                                <span className="flex flex-wrap gap-1 mt-1">
                                                                    {row.tags.filter((t) => t !== selected.name).map((t) => (
                                                                        <button
                                                                            key={t}
                                                                            type="button"
                                                                            onClick={(e) => { e.preventDefault(); setQ(t); go(t); }}
                                                                            className="rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-primary-50 dark:hover:bg-primary-900/40 px-1.5 py-px text-[10px]"
                                                                        >
                                                                            {t}
                                                                        </button>
                                                                    ))}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {row.status && (
                                                            <StatusBadge
                                                                status={row.status}
                                                                type={section.key === 'projects' ? 'project' : 'task'}
                                                            />
                                                        )}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
