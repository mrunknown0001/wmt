import { useState } from 'react';
import { router } from '@inertiajs/react';
import Modal from './Modal';
import Button from './Button';
import { apiFetch } from '../utils';

export default function DuplicateProjectModal({ isOpen, onClose, project }) {
    const [includeTasks, setIncludeTasks] = useState(true);
    const [copyDueDates, setCopyDueDates] = useState(true);
    const [copyAssignees, setCopyAssignees] = useState(true);
    const [copySubtasks, setCopySubtasks] = useState(true);
    const [processing, setProcessing] = useState(false);

    const handleDuplicate = async () => {
        if (!project) return;
        setProcessing(true);
        try {
            const res = await apiFetch(`/projects/${project.id}/duplicate`, {
                method: 'POST',
                body: JSON.stringify({
                    include_tasks: includeTasks,
                    copy_due_dates: copyDueDates,
                    copy_assignees: copyAssignees,
                    copy_subtasks: copySubtasks,
                }),
            });
            const data = await res.json();
            if (data.success) {
                onClose();
                router.visit(`/projects/${data.project.id}`);
            }
        } finally {
            setProcessing(false);
        }
    };

    const checkboxClass = 'h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 cursor-pointer';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Duplicate Project"
            actions={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button processing={processing} processingText="Duplicating..." onClick={handleDuplicate}>
                        Duplicate Project
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <p className="text-gray-600 dark:text-gray-400">
                    Create a copy of <strong className="text-gray-900 dark:text-gray-100">{project?.name}</strong>
                </p>

                <div className="space-y-3">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includeTasks}
                            onChange={(e) => setIncludeTasks(e.target.checked)}
                            className={checkboxClass}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">Include all tasks</span>
                    </label>

                    <div className={`ml-6 space-y-2.5 ${!includeTasks ? 'opacity-40 pointer-events-none' : ''}`}>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={copyDueDates}
                                onChange={(e) => setCopyDueDates(e.target.checked)}
                                className={checkboxClass}
                                disabled={!includeTasks}
                            />
                            <span className="text-sm text-gray-600 dark:text-gray-300">Copy due dates</span>
                        </label>

                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={copyAssignees}
                                onChange={(e) => setCopyAssignees(e.target.checked)}
                                className={checkboxClass}
                                disabled={!includeTasks}
                            />
                            <span className="text-sm text-gray-600 dark:text-gray-300">Copy assignees</span>
                        </label>

                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={copySubtasks}
                                onChange={(e) => setCopySubtasks(e.target.checked)}
                                className={checkboxClass}
                                disabled={!includeTasks}
                            />
                            <span className="text-sm text-gray-600 dark:text-gray-300">Copy subtasks</span>
                        </label>
                    </div>
                </div>

                <p className="text-xs text-gray-400 dark:text-gray-500">
                    Comments and activities will not be copied.
                </p>
            </div>
        </Modal>
    );
}
