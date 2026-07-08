import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function TaskContextMenu({ x, y, task, canEdit, canDelete, onDuplicate, onToggleComplete, onAddSubtask, onCopyLink, onDelete, onClose }) {
    const menuRef = useRef(null);
    const [position, setPosition] = useState({ left: x, top: y });

    // Adjust position if menu overflows viewport
    useEffect(() => {
        const el = menuRef.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        let left = x;
        let top = y;

        if (rect.right > window.innerWidth) {
            left = x - rect.width;
        }
        if (rect.bottom > window.innerHeight) {
            top = y - rect.height;
        }

        setPosition({ left, top });
    }, [x, y]);

    // Close on click outside, Escape, scroll, or another right-click
    useEffect(() => {
        // Delay listener registration to avoid catching the opening event
        const raf = requestAnimationFrame(() => {
            const handleMouseDown = (e) => {
                if (menuRef.current && !menuRef.current.contains(e.target)) {
                    onClose();
                }
            };
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') onClose();
            };
            const handleScroll = () => onClose();

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

        return () => {
            cancelAnimationFrame(raf);
            cleanup?.();
        };
    }, [onClose]);

    const isDone = task.status === 'done';
    const isParentTask = !task.parent_id;

    const itemClass = 'flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors';
    const dangerClass = 'flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors';

    return createPortal(
        <div
            ref={menuRef}
            style={{ position: 'fixed', left: position.left, top: position.top, zIndex: 9999 }}
            className="min-w-[200px] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1"
            onContextMenu={(e) => e.preventDefault()}
        >
            {canEdit && (
                <button className={itemClass} onClick={() => { onDuplicate(task); onClose(); }}>
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Duplicate
                </button>
            )}
            {canEdit && (
                <button className={itemClass} onClick={() => { onToggleComplete(task.id, null); onClose(); }}>
                    {isDone ? (
                        <>
                            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Mark Incomplete
                        </>
                    ) : (
                        <>
                            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Mark Complete
                        </>
                    )}
                </button>
            )}
            {canEdit && isParentTask && (
                <button className={itemClass} onClick={() => { onAddSubtask(task); onClose(); }}>
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add Subtask
                </button>
            )}

            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />

            <button className={itemClass} onClick={() => { onCopyLink(task); onClose(); }}>
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Copy Task Link
            </button>

            {canDelete && (
                <>
                    <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                    <button className={dangerClass} onClick={() => { onDelete(task.id, task.title); onClose(); }}>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete
                    </button>
                </>
            )}
        </div>,
        document.body
    );
}
