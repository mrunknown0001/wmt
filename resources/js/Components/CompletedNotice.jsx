import { formatDate, completionDelta } from '../utils';

/**
 * Says plainly that a task is finished, and how it did against its deadline.
 *
 * The counterpart to OverdueNotice, and deliberately the only box a done task
 * shows: green whether it landed early, on the day, or late, because the state
 * that matters most on a closed task is that it is closed. Lateness is a clause
 * inside the box, not a second box competing with it.
 *
 * Renders nothing for open tasks, so it can be dropped in unconditionally
 * alongside OverdueNotice.
 */
export default function CompletedNotice({ task, className = '' }) {
    if (task?.status !== 'done') return null;

    const delta = completionDelta(task);
    const finishedOn = formatDate(task.completed_at);

    // No deadline to measure against, so say only what is known.
    const against = delta === null ? null
        : delta > 0 ? `${delta} ${delta === 1 ? 'day' : 'days'} after it was due`
        : delta < 0 ? `${-delta} ${delta === -1 ? 'day' : 'days'} ahead of its due date`
        : 'on the day it was due';

    const detail = [
        finishedOn ? `Completed ${finishedOn}` : 'Completed',
        against,
    ].filter(Boolean).join(', ') + '.';

    return (
        <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300 ${className}`}>
            <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
                <span className="font-medium">This task is done</span>
                <span className="opacity-80"> · {detail}</span>
            </span>
        </div>
    );
}
