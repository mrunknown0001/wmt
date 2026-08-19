/**
 * Completion percentage for a task.
 *
 * Kept out of the component, next to columnPrefs, because the rule has real
 * edge cases and belongs somewhere it can be read on its own.
 *
 * Computed here rather than sent from the server for two reasons: every input
 * is already on the task the list has loaded, and the list mutates those inputs
 * optimistically when someone changes a status inline. A server-rendered
 * percentage would sit stale until the next reload.
 */

/** What each status is worth on its own. */
export const STATUS_PERCENT = {
    backlog: 0,
    to_do: 0,
    in_progress: 50,
    in_review: 75,
    done: 100,
    cancelled: 0,
};

/**
 * Cancelled subtasks are ignored rather than counted as incomplete. A cancelled
 * piece of work is not outstanding, so it should neither drag the parent down
 * nor stop it reaching 100%.
 */
const IGNORED_SUBTASK_STATUSES = ['cancelled'];

const isCounted = (t) => !IGNORED_SUBTASK_STATUSES.includes(t?.status);

/**
 * Subtasks take priority: a task with subtasks is as complete as they are, and
 * its own status is not consulted. Only when there are none does the status
 * mapping apply.
 *
 * Falls back to the counts the list already carries (subtasks_count /
 * completed_subtasks_count) when the subtask rows themselves are not loaded —
 * those cannot tell cancelled from outstanding, which is the one case where the
 * two paths can disagree.
 *
 * @param {object} task
 * @returns {number} 0-100, rounded
 */
export function taskCompletionPercent(task) {
    if (!task) return 0;

    if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
        const counted = task.subtasks.filter(isCounted);
        if (counted.length === 0) return STATUS_PERCENT[task.status] ?? 0;

        const done = counted.filter((t) => t.status === 'done').length;
        return Math.round((done / counted.length) * 100);
    }

    if (task.subtasks_count > 0) {
        return Math.round(((task.completed_subtasks_count || 0) / task.subtasks_count) * 100);
    }

    return STATUS_PERCENT[task.status] ?? 0;
}
