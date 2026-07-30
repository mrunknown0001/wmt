import { usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import LinkButton from '../../Components/LinkButton';
import NoteShareManager from '../../Components/NoteShareManager';
import { timeAgo } from '../../utils';

/**
 * Read-only view, for viewers.
 *
 * Anyone who can edit is sent to the editor instead, so this page never needs
 * to render a disabled editor.
 */
export default function Show() {
    const { note } = usePage().props;

    return (
        <AuthenticatedLayout title={note.title}>
            <div className="max-w-3xl">
                <PageHeader
                    title={note.title}
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Notes', href: '/notes' },
                        { label: note.title },
                    ]}
                    actions={<LinkButton href="/notes" variant="secondary">Back to Notes</LinkButton>}
                />

                <p className="-mt-3 mb-4 text-xs text-gray-500 dark:text-gray-400">
                    {note.is_mine ? 'Your note' : `Shared by ${note.owner}`} · view only · edited {timeAgo(note.updated_at)}
                    {note.archived && ' · Archived'}
                </p>

                <Card>
                    {note.content ? (
                        // The body is rich text the note's own author wrote and is
                        // rendered as markup, exactly as the editor produced it.
                        <div
                            className="prose prose-sm dark:prose-invert max-w-none"
                            dangerouslySetInnerHTML={{ __html: note.content }}
                        />
                    ) : (
                        <p className="text-sm text-gray-400">This note is empty.</p>
                    )}
                </Card>

                {note.shares?.length > 0 && (
                    <div className="mt-6">
                        <NoteShareManager basePath={`/notes/${note.id}`} shares={note.shares} canManage={false} />
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
