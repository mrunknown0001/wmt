import { useState } from 'react';

const MAX_USER_DEPTH = 4;

export function buildFolderTree(folders) {
    const byId = new Map(folders.map((f) => [f.id, { ...f, children: [] }]));
    const roots = [];
    byId.forEach((f) => {
        if (f.parent_id && byId.has(f.parent_id)) {
            byId.get(f.parent_id).children.push(f);
        } else {
            roots.push(f);
        }
    });
    return roots;
}

// Recursive project totals per folder (own projects + all descendants)
export function folderTotals(folders) {
    const totals = {};
    const walk = (node) => {
        let sum = node.project_count || 0;
        node.children.forEach((c) => { sum += walk(c); });
        totals[node.id] = sum;
        return sum;
    };
    buildFolderTree(folders).forEach(walk);
    return totals;
}

// Depth-first flat list with a `level` for indented pickers
export function flattenFolders(folders) {
    const out = [];
    const walk = (node, level) => {
        out.push({ ...node, level });
        node.children.forEach((c) => walk(c, level + 1));
    };
    buildFolderTree(folders).forEach((n) => walk(n, 0));
    return out;
}

export function folderAncestors(folders, folderId) {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const chain = [];
    let current = byId.get(Number(folderId));
    while (current) {
        chain.unshift(current);
        current = current.parent_id ? byId.get(current.parent_id) : null;
    }
    return chain;
}

export function FolderIcon({ folder, className = 'h-4 w-4' }) {
    const type = folder.is_system ? folder.source_type : 'Folder';
    const paths = {
        Division: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
        Department: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z',
        Team: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
        Folder: 'M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l1.122 1.122a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 8v1.776',
    };
    const colors = {
        Division: 'text-purple-500',
        Department: 'text-blue-500',
        Team: 'text-teal-500',
        Folder: 'text-amber-500',
    };

    return (
        <svg className={`${className} ${colors[type] || colors.Folder} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={paths[type] || paths.Folder} />
        </svg>
    );
}

const STORAGE_KEY = 'wmt-folders-expanded';

function loadExpanded() {
    try {
        return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []);
    } catch {
        return new Set();
    }
}

export default function FolderTree({
    folders,
    selectedId,
    onSelect,
    canManageAll,
    userId,
    onNewFolder,
    onRename,
    onDelete,
    onDropProject,
}) {
    const [expanded, setExpanded] = useState(loadExpanded);
    const [dragOverId, setDragOverId] = useState(null);

    const tree = buildFolderTree(folders);
    const totals = folderTotals(folders);

    const toggle = (id) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
            return next;
        });
    };

    const canManageFolder = (folder) =>
        !folder.is_system && (canManageAll || folder.created_by === userId);

    const canAddSubfolder = (folder) =>
        folder.is_system || folder.user_depth < MAX_USER_DEPTH;

    const handleDrop = (e, folderId) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverId(null);
        const projectId = e.dataTransfer.getData('project-id');
        if (projectId) onDropProject?.(Number(projectId), folderId);
    };

    const allowDrop = (e, folderId) => {
        if (!onDropProject) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOverId(folderId);
    };

    const renderNode = (node, level) => {
        const isOpen = expanded.has(node.id);
        const isSelected = String(selectedId) === String(node.id);
        const hasChildren = node.children.length > 0;

        return (
            <div key={node.id}>
                <div
                    className={`group flex items-center gap-1 rounded-lg pr-1 cursor-pointer transition-colors ${
                        isSelected
                            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                            : dragOverId === node.id
                                ? 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-400'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                    }`}
                    style={{ paddingLeft: `${level * 16 + 4}px` }}
                    onClick={() => onSelect(node.id)}
                    onDragOver={(e) => allowDrop(e, node.id)}
                    onDragLeave={() => setDragOverId((cur) => (cur === node.id ? null : cur))}
                    onDrop={(e) => handleDrop(e, node.id)}
                >
                    <button
                        type="button"
                        className={`p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ${hasChildren ? '' : 'invisible'}`}
                        onClick={(e) => { e.stopPropagation(); toggle(node.id); }}
                    >
                        <svg className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>

                    <FolderIcon folder={node} />

                    <span className="flex-1 truncate py-1.5 text-sm" title={node.name}>{node.name}</span>

                    {totals[node.id] > 0 && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{totals[node.id]}</span>
                    )}

                    <div className="hidden group-hover:flex items-center">
                        {canAddSubfolder(node) && (
                            <button
                                type="button"
                                title="New subfolder"
                                className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                onClick={(e) => { e.stopPropagation(); onNewFolder(node); }}
                            >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                            </button>
                        )}
                        {canManageFolder(node) && (
                            <>
                                <button
                                    type="button"
                                    title="Rename folder"
                                    className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    onClick={(e) => { e.stopPropagation(); onRename(node); }}
                                >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                                    </svg>
                                </button>
                                <button
                                    type="button"
                                    title="Delete folder"
                                    className="p-1 rounded text-gray-400 hover:text-red-500"
                                    onClick={(e) => { e.stopPropagation(); onDelete(node); }}
                                >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </>
                        )}
                    </div>

                    {node.is_system && (
                        <svg className="h-3 w-3 text-gray-300 dark:text-gray-600 shrink-0 group-hover:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} title="Managed by organization structure">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                    )}
                </div>

                {isOpen && node.children.map((child) => renderNode(child, level + 1))}
            </div>
        );
    };

    return (
        <div className="space-y-0.5">
            {/* Root: unfiled projects */}
            <div
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer text-sm transition-colors ${
                    selectedId === 'root' || selectedId === '' || selectedId == null
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                        : dragOverId === 'root'
                            ? 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-400'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
                }`}
                onClick={() => onSelect('root')}
                onDragOver={(e) => allowDrop(e, 'root')}
                onDragLeave={() => setDragOverId((cur) => (cur === 'root' ? null : cur))}
                onDrop={(e) => handleDrop(e, null)}
            >
                <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />
                </svg>
                <span className="flex-1">Unfiled</span>
            </div>

            {tree.map((node) => renderNode(node, 0))}
        </div>
    );
}
