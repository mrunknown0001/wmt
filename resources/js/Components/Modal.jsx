import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';

const SIZES = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
};

export default function Modal({ isOpen, onClose, title, children, actions, size = 'md' }) {
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
            <div className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-xl ${SIZES[size] || SIZES.md} w-full mx-4 p-6`}>
                {title && (
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
                        <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
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
