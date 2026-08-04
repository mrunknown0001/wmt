import { formatDate, overdueDays, isDueEarlierToday, isCompletedLate } from '../utils';

/**
 * Says plainly that a task has missed its deadline.
 *
 * Three distinct states, deliberately styled apart rather than lumped into one
 * red bar:
 *
 *  - overdue — past its due date and still open. Red, the counted kind.
 *  - due earlier today — the hour has gone but the day has not, so no count
 *    anywhere in the app treats it as late. Amber, to avoid contradicting them.
 *  - finished late — closed after the deadline. Muted; it is history now, not
 *    something to act on.
 *
 * Renders nothing when the task is on track, so it can be dropped in
 * unconditionally.
 */
export default function OverdueNotice({ task, className = '' }) {
    const days = overdueDays(task);
    const dueSoonPassed = days === 0 && isDueEarlierToday(task);
    const finishedLate = days === 0 && !dueSoonPassed && isCompletedLate(task);

    if (!days && !dueSoonPassed && !finishedLate) return null;

    const tone = days
        ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
        : dueSoonPassed
            ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300'
            : 'bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-700/40 dark:border-gray-600 dark:text-gray-300';

    const heading = days
        ? `Overdue by ${days} ${days === 1 ? 'day' : 'days'}`
        : dueSoonPassed
            ? 'Past its due time'
            : 'Finished late';

    const detail = days
        ? `Was due ${formatDate(task.due_date)}${task.due_time ? ` at ${String(task.due_time).slice(0, 5)}` : ''}.`
        : dueSoonPassed
            ? `Was due today at ${String(task.due_time).slice(0, 5)}.`
            : `Due ${formatDate(task.due_date)}, completed ${formatDate(task.completed_at)}.`;

    return (
        <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${tone} ${className}`}>
            <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
                <span className="font-medium">{heading}</span>
                <span className="opacity-80"> · {detail}</span>
            </span>
        </div>
    );
}
