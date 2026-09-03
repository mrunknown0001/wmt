import Checkbox from './Checkbox';

/**
 * Per-project rules that constrain how tasks in the project behave.
 * Shared by the project Create and Edit forms.
 */
export default function ProjectRules({ requireAttachment, onChange, hideCompleted, onHideCompletedChange, showTimeInMotion, onShowTimeInMotionChange }) {
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

            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Checkbox
                    label="Track time in motion"
                    id="show_time_in_motion"
                    checked={!!showTimeInMotion}
                    onChange={(e) => onShowTimeInMotionChange(e.target.checked)}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-6">
                    Adds <span className="font-medium">Date Started</span> and
                    <span className="font-medium"> In Motion</span> to the task list, beside
                    Date Completed. A task is stamped as started when it moves into In
                    Progress, or by the <span className="font-medium">Start</span> button on
                    the task itself. In Motion is the elapsed time between the two — which is
                    how long the work was open, not how much effort was logged against it.
                </p>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Checkbox
                    label="Hide completed tasks"
                    id="hide_completed_tasks"
                    checked={!!hideCompleted}
                    onChange={(e) => onHideCompletedChange(e.target.checked)}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-6">
                    Done and cancelled tasks are collapsed out of the list view, with a
                    <span className="font-medium"> Show completed</span> link in each section
                    to reveal them. Nothing is deleted or archived — this only affects what
                    the list shows by default.
                </p>
            </div>
        </div>
    );
}
