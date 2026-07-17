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
    const [copyAutomationRules, setCopyAutomationRules] = useState(true);
    const [copyForms, setCopyForms] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

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
                    copy_automation_rules: copyAutomationRules,
                    copy_forms: copyForms,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setShowSuccess(true);
                setTimeout(() => {
                    onClose();
                    router.visit(`/projects/${data.project.id}`);
                }, 1500);
            }
        } finally {
            setProcessing(false);
        }
    };

    const checkboxClass = 'h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 cursor-pointer';

    if (showSuccess) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Duplicate Project">
                <div className="flex flex-col items-center justify-center py-8 space-y-3">
                    <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-3">
                        <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Project duplicated successfully!
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Redirecting to {project?.name && `"Copy of ${project.name}"`}...
                        </p>
                    </div>
                </div>
            </Modal>
        );
    }

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

                    <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={copyAutomationRules}
                            onChange={(e) => setCopyAutomationRules(e.target.checked)}
                            className={checkboxClass}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">Copy automation rules</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={copyForms}
                            onChange={(e) => setCopyForms(e.target.checked)}
                            className={checkboxClass}
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">Copy forms</span>
                    </label>
                </div>

                <p className="text-xs text-gray-400 dark:text-gray-500">
                    Comments and activities will not be copied.
                </p>
            </div>
        </Modal>
    );
}
