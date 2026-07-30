import { useState } from 'react';
import { router, useForm, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Select from '../../Components/Select';
import RichTextEditor from '../../Components/RichTextEditor';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';
import NoteShareManager from '../../Components/NoteShareManager';
import { ConfirmModal } from '../../Components/Modal';

export default function Edit() {
    const { note, folders = [], defaultFolderId } = usePage().props;
    const isNew = !note;

    const [confirmDelete, setConfirmDelete] = useState(false);

    const { data, setData, post, put, processing, errors } = useForm({
        title: note?.title === 'Untitled note' ? '' : (note?.title || ''),
        content: note?.content || '',
        note_folder_id: note?.note_folder_id || defaultFolderId || '',
    });

    const submit = (e) => {
        e.preventDefault();
        if (isNew) {
            post('/notes');
        } else {
            put(`/notes/${note.id}`, { preserveScroll: true });
        }
    };

    const canFile = isNew || note.can_file;

    return (
        <AuthenticatedLayout title={isNew ? 'New Note' : 'Edit Note'}>
            <div className="max-w-3xl">
                <PageHeader
                    title={isNew ? 'New Note' : 'Edit Note'}
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Notes', href: '/notes' },
                        { label: isNew ? 'New' : note.title },
                    ]}
                />

                {!isNew && !note.is_mine && (
                    <div className="mb-5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
                        Shared with you by <span className="font-medium">{note.owner}</span> — you have{' '}
                        <span className="font-medium">{note.role}</span> access.
                    </div>
                )}

                <Card>
                    <form onSubmit={submit} className="space-y-5">
                        <Input
                            label="Title" id="title" value={data.title}
                            onChange={(e) => setData('title', e.target.value)}
                            placeholder="Untitled note"
                            error={errors.title}
                        />

                        <RichTextEditor
                            label="Note" id="content" value={data.content}
                            onChange={(val) => setData('content', val)}
                            error={errors.content}
                            placeholder="Start writing..."
                        />

                        {canFile && (
                            <Select
                                label="Folder" id="note_folder_id" value={data.note_folder_id}
                                onChange={(e) => setData('note_folder_id', e.target.value)}
                                placeholder="— Unfiled —"
                                options={folders.map((f) => ({ value: f.id, label: `${' '.repeat(f.depth * 3)}${f.name}` }))}
                                error={errors.note_folder_id}
                            />
                        )}

                        <div className="flex items-center justify-between gap-3 pt-4">
                            <div className="flex items-center gap-2">
                                {!isNew && note.can_administer && (
                                    <>
                                        <Button
                                            type="button" variant="secondary" size="sm"
                                            onClick={() => router.post(`/notes/${note.id}/${note.archived ? 'unarchive' : 'archive'}`, {}, { preserveScroll: true })}
                                        >
                                            {note.archived ? 'Restore from archive' : 'Archive'}
                                        </Button>
                                        <Button type="button" variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                                            Delete
                                        </Button>
                                    </>
                                )}
                            </div>
                            <div className="flex gap-3">
                                {/* Leaving the editor goes back to reading the note,
                                    not out to the list — that is where you came from. */}
                                <LinkButton href={isNew ? '/notes' : `/notes/${note.id}`} variant="secondary">
                                    {isNew ? 'Cancel' : 'Done'}
                                </LinkButton>
                                <Button type="submit" processing={processing} processingText="Saving...">
                                    {isNew ? 'Create Note' : 'Save'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </Card>

                {/* Sharing needs a note to hang off, so it appears once saved. */}
                {!isNew && (
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
                message={`Delete “${note?.title}”? Anyone it is shared with will lose access to it.`}
            />
        </AuthenticatedLayout>
    );
}
