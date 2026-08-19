import { useEffect, useState } from 'react';

function toastMessage(data) {
    switch (data.type) {
        case 'task_assigned':
            return `${data.assigned_by} assigned you to "${data.task_title}"`;
        case 'task_due_soon':
            return `Task "${data.task_title}" is due tomorrow`;
        case 'task_due_reminder':
            return `Task "${data.task_title}" is due ${data.days_before === 1 ? 'tomorrow' : `in ${data.days_before} days`}`;
        case 'task_overdue':
            return `Task "${data.task_title}" is overdue`;
        case 'task_comment':
            return `${data.commented_by} commented on "${data.task_title}"`;
        case 'subtask_comment':
            return `${data.commented_by} commented on subtask "${data.task_title}"`;
        case 'task_comment_mention':
            return `${data.mentioned_by} mentioned you in "${data.task_title}"`;
        case 'comment_deleted':
            return `${data.deleted_by} deleted a comment mentioning you in "${data.task_title}"`;
        case 'task_escalated':
            return `Task "${data.task_title}" escalated — ${data.escalation_label}`;
        case 'approval_requested':
            return `New approval request: "${data.item_title}"`;
        case 'approval_approved':
            return `Your request "${data.item_title}" was approved`;
        case 'approval_rejected':
            return `Your request "${data.item_title}" was rejected`;
        case 'approval_changes_requested':
            return `Changes requested on "${data.item_title}"`;
        case 'approval_item_shared':
            return `${data.shared_by} shared the request "${data.item_title}" with you`;
        case 'approval_due_soon':
            return `Approval "${data.item_title}" is ${data.timing}`;
        case 'approval_overdue':
            return `Approval "${data.item_title}" is ${data.timing}`;
        case 'approval_automation':
            return data.message || `Update on "${data.item_title}"`;
        case 'automation_blocked':
            return `Could not complete "${data.task_title}" — ${data.reason || 'it needs an attachment'}`;
        case 'note_shared':
            return `${data.shared_by} shared the note "${data.note_title}" with you`;
        case 'note_folder_shared':
            return `${data.shared_by} shared the notes folder "${data.folder_name}" with you`;
        case 'task_delegation_started':
            return data.message || `You are covering ${data.owner_name}`;
        case 'task_delegation_returned':
            return data.message || `Cover for ${data.owner_name} has ended`;
        case 'external_webhook':
            return data.message || `You have an item to review in ${data.platform}`;
        default:
            return 'New notification';
    }
}

function Toast({ toast, onDismiss }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Trigger enter animation
        requestAnimationFrame(() => setVisible(true));

        const timer = setTimeout(() => {
            setVisible(false);
            setTimeout(() => onDismiss(toast.id), 200);
        }, 5000);

        return () => clearTimeout(timer);
    }, []);

    return (
        <div
            className={`flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-800 px-4 py-3 shadow-lg transition-all duration-200 ${
                visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
            }`}
        >
            <svg className="h-5 w-5 text-blue-500 dark:text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="text-sm font-medium text-blue-800 dark:text-blue-200 flex-1">
                {toastMessage(toast.data)}
            </span>
            <button
                onClick={() => onDismiss(toast.id)}
                className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
            >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}

export default function NotificationToast({ toasts, onDismiss }) {
    if (!toasts || toasts.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
            {toasts.map((toast) => (
                <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
}
