import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export default function InlinePopover({ isOpen, onClose, anchorRef, children, className = '' }) {
    const popoverRef = useRef(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [positioned, setPositioned] = useState(false);

    useLayoutEffect(() => {
        if (!isOpen) { setPositioned(false); return; }
        if (!anchorRef?.current || !popoverRef?.current) return;

        const rect = anchorRef.current.getBoundingClientRect();
        const popoverRect = popoverRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const openAbove = spaceBelow < popoverRect.height + 8 && rect.top > popoverRect.height + 8;

        // Use clientWidth to exclude scrollbar width and prevent overflow
        const viewportWidth = document.documentElement.clientWidth;
        const maxLeft = viewportWidth - popoverRect.width - 8;
        const left = Math.min(rect.left + window.scrollX, maxLeft);

        setPosition({
            top: openAbove
                ? rect.top + window.scrollY - popoverRect.height - 4
                : rect.bottom + window.scrollY + 4,
            left: Math.max(8, left),
        });
        setPositioned(true);
    }, [isOpen, anchorRef, children]);

    useEffect(() => {
        if (!isOpen) return;
        const handleMouseDown = (e) => {
            if (
                popoverRef.current && !popoverRef.current.contains(e.target) &&
                anchorRef?.current && !anchorRef.current.contains(e.target)
            ) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleMouseDown);
        return () => document.removeEventListener('mousedown', handleMouseDown);
    }, [isOpen, onClose, anchorRef]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div
            ref={popoverRef}
            style={{ position: 'absolute', top: position.top, left: position.left, zIndex: 50, visibility: positioned ? 'visible' : 'hidden' }}
            className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg ${positioned ? 'animate-slide-down' : ''} ${className}`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
        >
            {children}
        </div>,
        document.body
    );
}
