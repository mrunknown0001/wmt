import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function InlinePopover({ isOpen, onClose, anchorRef, children, className = '' }) {
    const popoverRef = useRef(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (isOpen && anchorRef?.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + window.scrollY + 4,
                left: rect.left + window.scrollX,
            });
        }
    }, [isOpen, anchorRef]);

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
            style={{ position: 'absolute', top: position.top, left: position.left, zIndex: 50 }}
            className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg ${className}`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {children}
        </div>,
        document.body
    );
}
