import Checkbox from './Checkbox';

/**
 * Per-project rules that constrain how tasks in the project behave.
 * Shared by the project Create and Edit forms.
 */
export default function ProjectRules({ requireAttachment, onChange }) {
    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Project Rules</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3">
                Extra conditions tasks in this project must satisfy.
            </p>

            <Checkbox
                label="Require an attachment before closing a task"
                id="require_comment_attachment_on_close"
                checked={!!requireAttachment}
                onChange={(e) => onChange(e.target.checked)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-6">
                A task can't be marked <span className="font-medium">Done</span> or{' '}
                <span className="font-medium">Cancelled</span> until it has a file attached —
                either on the task itself (including files submitted through a form) or on one
                of its comments. Useful when completion needs proof of work.
            </p>
        </div>
    );
}
