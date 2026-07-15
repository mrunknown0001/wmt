import { useState } from 'react';
import { router } from '@inertiajs/react';
import Modal from './Modal';
import { flattenFolders, FolderIcon } from './FolderTree';

export default function MoveToFolderModal({ isOpen, onClose, project, folders = [] }) {
    const [search, setSearch] = useState('');
    const [processing, setProcessing] = useState(false);

    if (!project) return null;

    const flat = flattenFolders(folders);
    const filtered = search
        ? flat.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
        : flat;

    const move = (folderId) => {
        setProcessing(true);
        router.patch(`/projects/${project.id}/folder`, { folder_id: folderId }, {
            preserveScroll: true,
            onFinish: () => setProcessing(false),
            onSuccess: () => { setSearch(''); onClose(); },
        });
    };

    const currentId = project.folder_id ?? null;

    const itemClass = (active) =>
        `w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-lg transition-colors ${
            active
                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`;

    return (
        <Modal isOpen={isOpen} onClose={() => { setSearch(''); onClose(); }} title={`Move "${project.name}" to...`}>
            <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search folders..."
                className="w-full mb-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                autoFocus
            />
            <div className="max-h-72 overflow-y-auto space-y-0.5">
                <button type="button" disabled={processing} className={itemClass(currentId === null)} onClick={() => move(null)}>
                    <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
                    </svg>
                    Unfiled (no folder)
                </button>
                {filtered.map((f) => (
                    <button
                        key={f.id}
                        type="button"
                        disabled={processing}
                        className={itemClass(currentId === f.id)}
                        style={{ paddingLeft: `${(search ? 0 : f.level) * 16 + 12}px` }}
                        onClick={() => move(f.id)}
                    >
                        <FolderIcon folder={f} />
                        <span className="truncate">{f.name}</span>
                    </button>
                ))}
                {filtered.length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">No folders found</div>
                )}
            </div>
        </Modal>
    );
}
