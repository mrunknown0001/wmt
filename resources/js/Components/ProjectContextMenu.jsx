import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Tooltip from './Tooltip';

export default function ProjectContextMenu({ project, isArchived, onEdit, onCopyLink, onDuplicate, onMoveToFolder, onTogglePin, onArchive, onDelete, canArchive = true, canDelete = true, align = 'right' }) {
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [positioned, setPositioned] = useState(false);
    const [copied, setCopied] = useState(false);

    useLayoutEffect(() => {
        if (!isOpen) { setPositioned(false); return; }
        if (!buttonRef.current || !menuRef.current) return;

        const rect = buttonRef.current.getBoundingClientRect();
        const menuRect = menuRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const openAbove = spaceBelow < menuRect.height + 8 && rect.top > menuRect.height + 8;

        const viewportWidth = document.documentElement.clientWidth;
        const preferred = align === 'left' ? rect.left : rect.right - menuRect.width;
        const left = Math.min(preferred, viewportWidth - menuRect.width - 8);

        setPosition({
            top: openAbove ? rect.top - menuRect.height - 4 : rect.bottom + 4,
            left: Math.max(8, left),
        });
        setPositioned(true);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const raf = requestAnimationFrame(() => {
            const handleMouseDown = (e) => {
                if (menuRef.current && !menuRef.current.contains(e.target) &&
                    buttonRef.current && !buttonRef.current.contains(e.target)) {
                    setIsOpen(false);
                }
            };
            const handleKeyDown = (e) => { if (e.key === 'Escape') setIsOpen(false); };
            const handleScroll = () => setIsOpen(false);

            document.addEventListener('mousedown', handleMouseDown);
            document.addEventListener('keydown', handleKeyDown);
            document.addEventListener('scroll', handleScroll, true);

            cleanup = () => {
                document.removeEventListener('mousedown', handleMouseDown);
                document.removeEventListener('keydown', handleKeyDown);
                document.removeEventListener('scroll', handleScroll, true);
            };
        });

        let cleanup = null;
        return () => { cancelAnimationFrame(raf); cleanup?.(); };
    }, [isOpen]);

    const handleCopyLink = () => {
        const url = `${window.location.origin}/projects/${project.id}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
        setIsOpen(false);
        onCopyLink?.();
    };

    const itemClass = 'flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors';
    const dangerClass = 'flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors';

    return (
        <>
            <Tooltip content="More actions">
                <button
                    ref={buttonRef}
                    onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </Tooltip>

            {isOpen && createPortal(
                <div
                    ref={menuRef}
                    style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 9999, visibility: positioned ? 'visible' : 'hidden' }}
                    className="min-w-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button className={itemClass} onClick={() => { setIsOpen(false); onEdit(); }}>
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Edit Project Settings
                    </button>

                    <button className={itemClass} onClick={handleCopyLink}>
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        {copied ? 'Copied!' : 'Copy Project Link'}
                    </button>

                    <button className={itemClass} onClick={() => { setIsOpen(false); onDuplicate(); }}>
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Duplicate
                    </button>

                    {onMoveToFolder && (
                        <button className={itemClass} onClick={() => { setIsOpen(false); onMoveToFolder(); }}>
                            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l1.122 1.122a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 8v1.776" />
                            </svg>
                            Move to Folder
                        </button>
                    )}

                    {onTogglePin && (
                        <button className={itemClass} onClick={() => { setIsOpen(false); onTogglePin(); }}>
                            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                {project.is_pinned ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8z" />
                                )}
                            </svg>
                            {project.is_pinned ? 'Unpin from Top' : 'Pin to Top'}
                        </button>
                    )}

                    {/* Archive and delete are owner-only; a project admin sees
                        everything above but not these. */}
                    {canArchive && (
                        <>
                            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

                            <button className={itemClass} onClick={() => { setIsOpen(false); onArchive(); }}>
                                {isArchived ? (
                                    <>
                                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4l2-2m0 0l2 2m-2-2v4" />
                                        </svg>
                                        Unarchive
                                    </>
                                ) : (
                                    <>
                                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                        </svg>
                                        Archive
                                    </>
                                )}
                            </button>
                        </>
                    )}

                    {canDelete && (
                        <>
                            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

                            <button className={dangerClass} onClick={() => { setIsOpen(false); onDelete(); }}>
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete
                            </button>
                        </>
                    )}
                </div>,
                document.body
            )}
        </>
    );
}
