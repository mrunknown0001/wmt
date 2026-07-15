import { useEffect, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';

// Create a folder (pass parentFolder or null) or rename one (pass folder)
export default function FolderNameModal({ isOpen, onClose, onSubmit, folder = null, parentFolder = null, processing = false, error = null }) {
    const [name, setName] = useState('');

    useEffect(() => {
        if (isOpen) setName(folder?.name || '');
    }, [isOpen, folder]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit(name.trim());
    };

    const title = folder
        ? 'Rename Folder'
        : parentFolder
            ? `New Folder in "${parentFolder.name}"`
            : 'New Folder';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            actions={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} processing={processing} processingText="Saving...">
                        {folder ? 'Rename' : 'Create Folder'}
                    </Button>
                </>
            }
        >
            <form onSubmit={handleSubmit}>
                <Input
                    label="Folder name"
                    id="folder-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    error={error}
                    autoFocus
                />
            </form>
        </Modal>
    );
}
