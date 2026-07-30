import { useState, useEffect, useRef } from 'react';
import { Link, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';
import Modal, { ConfirmModal } from '../../Components/Modal';
import NoteShareManager from '../../Components/NoteShareManager';
import Input from '../../Components/Input';
import Select from '../../Components/Select';
import Tooltip from '../../Components/Tooltip';
import { timeAgo } from '../../utils';

const SCOPES = [
    { key: 'mine', label: 'My Notes' },
    { key: 'shared', label: 'Shared with me' },
    { key: 'archived', label: 'Archived' },
];

const ROLE_BADGE = {
    owner: 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
    admin: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    editor: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    viewer: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

/**
 * Bold the searched term inside a snippet.
 *
 * Split on the term rather than replacing into HTML — building markup from a
 * user's own note text and dangerouslySetInnerHTML-ing it back would turn the
 * search box into an injection point.
 */
function Highlight({ text, term }) {
    if (!text) return null;
    if (!term) return <>{text}</>;

    const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));

    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === term.toLowerCase() ? (
                    <mark key={i} className="bg-yellow-200 dark:bg-yellow-500/40 text-inherit rounded px-0.5">{part}</mark>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </>
    );
}

export default function Index() {
    const { notes = [], folders = [], scope, q, activeFolder, counts = {} } = usePage().props;

    const [search, setSearch] = useState(q || '');
    const [folderModal, setFolderModal] = useState(null); // { id?, name, parent_id } | null
    const [confirmFolder, setConfirmFolder] = useState(null);
    const [shareFolderId, setShareFolderId] = useState(null);
    const firstRender = useRef(true);

    // Debounced server-side search. Notes are searched by body as well as
    // title, so this cannot be done by filtering what's already on the page.
    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timer = setTimeout(() => {
            router.get('/notes', { scope, q: search || undefined, folder: activeFolder || undefined }, {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                only: ['notes', 'q'],
            });
        }, 250);

        return () => clearTimeout(timer);
    }, [search]);

    const go = (params) => router.get('/notes', { scope, folder: activeFolder || undefined, q: search || undefined, ...params }, {
        preserveState: true,
        preserveScroll: true,
    });

    const submitFolder = (e) => {
        e.preventDefault();
        const payload = { name: folderModal.name, parent_id: folderModal.parent_id || null };
        const done = { onSuccess: () => setFolderModal(null), preserveScroll: true };

        if (folderModal.id) {
            router.put(`/notes/folders/${folderModal.id}`, payload, done);
        } else {
            router.post('/notes/folders', payload, done);
        }
    };

    const scopeButton = (s) => (
        <button
            key={s.key}
            onClick={() => go({ scope: s.key, folder: undefined })}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                scope === s.key
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
            }`}
        >
            <span>{s.label}</span>
            {counts[s.key] > 0 && <span className="text-xs text-gray-400">{counts[s.key]}</span>}
        </button>
    );

    return (
        <AuthenticatedLayout title="Notes">
            <PageHeader
                title="Notes"
                breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Notes' }]}
                actions={<LinkButton href="/notes/create">New Note</LinkButton>}
            />

            <div className="flex gap-6 items-start">
                {/* Folders */}
                <aside className="w-56 shrink-0 hidden md:block">
                    <div className="space-y-1">{SCOPES.map(scopeButton)}</div>

                    <div className="mt-5">
                        <div className="flex items-center justify-between px-3 mb-1">
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Folders</p>
                            <Tooltip content="New folder">
                                <button
                                    onClick={() => setFolderModal({ name: '', parent_id: '' })}
                                    className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                    </svg>
                                </button>
                            </Tooltip>
                        </div>

                        <button
                            onClick={() => go({ scope: 'mine', folder: 'none' })}
                            className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                activeFolder === 'none'
                                    ? 'bg-gray-100 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                            }`}
                        >
                            Unfiled
                        </button>

                        {folders.map((f) => (
                            <div key={f.id} className="group flex items-center">
                                <button
                                    onClick={() => go({ scope: 'mine', folder: String(f.id) })}
                                    style={{ paddingLeft: `${12 + f.depth * 12}px` }}
                                    className={`flex-1 min-w-0 text-left pr-2 py-1.5 rounded-lg text-sm truncate transition-colors ${
                                        String(activeFolder) === String(f.id)
                                            ? 'bg-gray-100 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100'
                                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                                    }`}
                                >
                                    {f.name}
                                    {f.note_count > 0 && <span className="ml-1.5 text-xs text-gray-400">{f.note_count}</span>}
                                </button>
                                {f.shares.length > 0 && (
                                    <Tooltip content={`Shared with ${f.shares.length}`}>
                                        <svg className="h-3.5 w-3.5 shrink-0 text-gray-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                    </Tooltip>
                                )}
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 pr-1">
                                    <Tooltip content="Share folder">
                                        <button
                                            onClick={() => setShareFolderId(f.id)}
                                            className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                                        >
                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342a3 3 0 100-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684zm0-12a3 3 0 105.368-2.684A3 3 0 0015.316 6.658z" />
                                            </svg>
                                        </button>
                                    </Tooltip>
                                    <Tooltip content="Rename">
                                        <button
                                            onClick={() => setFolderModal({ id: f.id, name: f.name, parent_id: f.parent_id || '' })}
                                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                        >
                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        </button>
                                    </Tooltip>
                                    <Tooltip content="Delete folder">
                                        <button
                                            onClick={() => setConfirmFolder(f)}
                                            className="text-gray-400 hover:text-red-500"
                                        >
                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </Tooltip>
                                </div>
                            </div>
                        ))}

                        {folders.length === 0 && (
                            <p className="px-3 py-1.5 text-xs text-gray-400">No folders yet</p>
                        )}
                    </div>
                </aside>

                {/* Notes */}
                <div className="flex-1 min-w-0">
                    <div className="relative mb-4">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                        </svg>
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search titles and note contents..."
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                        />
                    </div>

                    {notes.length === 0 ? (
                        <div className="text-center py-16 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {q ? `Nothing matches “${q}”.` : 'No notes here yet.'}
                            </p>
                            {!q && scope === 'mine' && (
                                <LinkButton href="/notes/create" className="mt-3">Write your first note</LinkButton>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {notes.map((note) => (
                                <Link
                                    key={note.id}
                                    href={note.can_edit ? `/notes/${note.id}/edit` : `/notes/${note.id}`}
                                    className="block rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 hover:border-primary-400 dark:hover:border-primary-500 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                            <Highlight text={note.title} term={q} />
                                        </h3>
                                        <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide ${ROLE_BADGE[note.role] || ROLE_BADGE.viewer}`}>
                                            {note.role}
                                        </span>
                                    </div>

                                    {(note.snippet || note.excerpt) && (
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                            <Highlight text={note.snippet || note.excerpt} term={q} />
                                        </p>
                                    )}

                                    <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
                                        {!note.is_mine && <span>from {note.owner}</span>}
                                        {note.folder && <span>· {note.folder.name}</span>}
                                        {note.archived && <span>· Archived</span>}
                                        <span>· edited {timeAgo(note.updated_at)}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <Modal isOpen={!!folderModal} onClose={() => setFolderModal(null)} title={folderModal?.id ? 'Rename Folder' : 'New Folder'} size="sm">
                <form onSubmit={submitFolder} className="space-y-4">
                    <Input
                        label="Name" id="folder_name" value={folderModal?.name || ''}
                        onChange={(e) => setFolderModal({ ...folderModal, name: e.target.value })}
                    />
                    <Select
                        label="Inside" id="folder_parent" value={folderModal?.parent_id ?? ''}
                        onChange={(e) => setFolderModal({ ...folderModal, parent_id: e.target.value })}
                        placeholder="— Top level —"
                        options={folders
                            .filter((f) => f.id !== folderModal?.id)
                            .map((f) => ({ value: f.id, label: `${' '.repeat(f.depth * 3)}${f.name}` }))}
                    />
                    <div className="flex justify-end gap-3">
                        <Button type="button" variant="secondary" onClick={() => setFolderModal(null)}>Cancel</Button>
                        <Button type="submit">{folderModal?.id ? 'Save' : 'Create'}</Button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={!!shareFolderId}
                onClose={() => setShareFolderId(null)}
                title={`Share “${folders.find((f) => f.id === shareFolderId)?.name || ''}”`}
                size="md"
            >
                {shareFolderId && (
                    <NoteShareManager
                        basePath={`/notes/folders/${shareFolderId}`}
                        shares={folders.find((f) => f.id === shareFolderId)?.shares || []}
                        canManage
                        title="Folder sharing"
                        hint="Everyone you share this folder with gets the same access to every note inside it, and inside any folder beneath it."
                    />
                )}
            </Modal>

            <ConfirmModal
                isOpen={!!confirmFolder}
                onClose={() => setConfirmFolder(null)}
                onConfirm={() => {
                    router.delete(`/notes/folders/${confirmFolder.id}`, { preserveScroll: true });
                    setConfirmFolder(null);
                }}
                title="Delete Folder"
                message={`Delete “${confirmFolder?.name}”? Its notes move to Unfiled — nothing is deleted with it.`}
            />
        </AuthenticatedLayout>
    );
}
