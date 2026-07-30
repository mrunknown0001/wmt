import { useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';
import NoteShareManager from '../../Components/NoteShareManager';
import { ConfirmModal } from '../../Components/Modal';
import { timeAgo } from '../../utils';

/**
 * Reading view — where clicking a note in the list lands.
 *
 * Everyone comes here first, whatever their role. Editing is a deliberate step
 * from the button, so opening a note to read it can't turn into changing it by
 * accident.
 */
export default function Show() {
    const { note } = usePage().props;
    const [confirmDelete, setConfirmDelete] = useState(false);

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
                    actions={
                        <div className="flex items-center gap-2">
                            <LinkButton href="/notes" variant="secondary">Back to Notes</LinkButton>
                            {note.can_edit && (
                                <LinkButton href={`/notes/${note.id}/edit`}>Edit</LinkButton>
                            )}
                        </div>
                    }
                />

                <p className="-mt-3 mb-4 text-xs text-gray-500 dark:text-gray-400">
                    {note.is_mine ? 'Your note' : `Shared by ${note.owner}`}
                    {!note.can_edit && ' · view only'}
                    {note.folder && ` · ${note.folder.name}`}
                    {note.archived && ' · Archived'}
                    {' · edited '}{timeAgo(note.updated_at)}
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
                        <p className="text-sm text-gray-400">
                            This note is empty.
                            {note.can_edit && ' Use Edit to start writing.'}
                        </p>
                    )}
                </Card>

                {note.can_administer && (
                    <div className="mt-4 flex items-center gap-2">
                        <Button
                            variant="secondary" size="sm"
                            onClick={() => router.post(`/notes/${note.id}/${note.archived ? 'unarchive' : 'archive'}`, {}, { preserveScroll: true })}
                        >
                            {note.archived ? 'Restore from archive' : 'Archive'}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>Delete</Button>
                    </div>
                )}

                {/* Shown to everyone who can see the note, so a viewer can tell
                    who else has it. Only an admin or the owner may change it. */}
                {(note.shares?.length > 0 || note.can_manage_shares) && (
                    <div className="mt-6">
                        <NoteShareManager
                            basePath={`/notes/${note.id}`}
                            shares={note.shares || []}
                            canManage={note.can_manage_shares}
                        />
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                onConfirm={() => router.delete(`/notes/${note.id}`)}
                title="Delete Note"
                message={`Delete “${note.title}”? Anyone it is shared with will lose access to it.`}
            />
        </AuthenticatedLayout>
    );
}
