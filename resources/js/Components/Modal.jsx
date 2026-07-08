import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import Tooltip from './Tooltip';

const SIZES = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
};

export default function Modal({ isOpen, onClose, title, children, actions, size = 'md' }) {
    const [isClosing, setIsClosing] = useState(false);

    const handleClose = useCallback(() => {
        if (isClosing) return;
        setIsClosing(true);
        setTimeout(() => {
            setIsClosing(false);
            onClose();
        }, 200);
    }, [onClose, isClosing]);

    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') handleClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [isOpen, handleClose]);

    if (!isOpen && !isClosing) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className={`fixed inset-0 bg-black/50 ${isClosing ? 'animate-[backdrop-fade-in_200ms_ease_reverse_forwards]' : 'animate-backdrop'}`}
                onClick={handleClose}
            />
            <div className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-xl ${SIZES[size] || SIZES.md} w-full mx-4 p-6 ${isClosing ? 'animate-[scale-out_200ms_ease_forwards]' : 'animate-scale-in'}`}>
                {title && (
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
                            <Tooltip content="Close"><button onClick={handleClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button></Tooltip>
                    </div>
                )}
                <div className="text-sm text-gray-600 dark:text-gray-300">{children}</div>
                {actions && <div className="mt-6 flex justify-end gap-2">{actions}</div>}
            </div>
        </div>,
        document.body
    );
}

export function ConfirmModal({ isOpen, onClose, onConfirm, title = 'Confirm', message, confirmLabel = 'Delete', variant = 'danger' }) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            actions={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button variant={variant} onClick={onConfirm}>{confirmLabel}</Button>
                </>
            }
        >
            <p>{message}</p>
        </Modal>
    );
}
