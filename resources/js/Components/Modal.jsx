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
                {title && <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>}
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
