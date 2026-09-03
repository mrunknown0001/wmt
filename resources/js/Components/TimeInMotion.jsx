import { useEffect, useState } from 'react';
import { apiFetch, formatDate, formatElapsed } from '../utils';

/**
 * When work actually began, and how long it has been going.
 *
 * The plan lives in start and due dates; this is the record of what happened.
 * A task is stamped as started on its way into In Progress, but plenty of work
 * begins before anybody moves a card — hence the button, which starts the clock
 * from the truth rather than from whenever the status caught up.
 *
 * It sits at the top of the task, above the fields, because a button that has
 * to be hunted for before work starts is a button nobody presses. Until it is
 * pressed it glows, for the same reason; once pressed there is nothing left to
 * press, so the strip goes quiet and just reports.
 *
 * Pressing it twice does nothing the second time: the first press was when the
 * work started, and resetting that would quietly shorten the span.
 *
 * Not the same measure as the time logs beside it. Those record effort spent;
 * this records elapsed time, and is normally the larger number.
 */
export default function TimeInMotion({ projectId, taskId, startedAt, completedAt, status = null, canEdit = true }) {
    // Finished work is not waiting to be started. Cancelled counts as finished
    // even though it carries no completion time — only 'done' is stamped — and
    // a cancelled task wants a Start button least of all.
    const finished = !!completedAt || ['done', 'cancelled'].includes(status);
    const [started, setStarted] = useState(startedAt || null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    // Re-rendered on a timer while the task is open, or the elapsed figure
    // would sit frozen at whatever it was when the page loaded.
    const [, setTick] = useState(0);

    useEffect(() => setStarted(startedAt || null), [startedAt]);

    useEffect(() => {
        if (!started || finished) return undefined;

        const id = setInterval(() => setTick((n) => n + 1), 60000);

        return () => clearInterval(id);
    }, [started, finished]);

    const minutes = (() => {
        if (!started) return null;
        // Closed with no recorded end — a cancelled task. The span is genuinely
        // unknown, and counting it up to now would invent one.
        if (finished && !completedAt) return null;

        const from = new Date(started);
        const to = completedAt ? new Date(completedAt) : new Date();
        const mins = Math.round((to - from) / 60000);

        return mins < 0 ? null : mins;
    })();

    const start = () => {
        if (saving || started) return;
        setSaving(true);

        // apiFetch, not Inertia's router: this endpoint answers with JSON, and
        // an Inertia visit expects an Inertia response — it discards a plain
        // JSON reply, so the button appeared to do nothing at all.
        apiFetch(`/projects/${projectId}/tasks/${taskId}/start`, { method: 'PATCH' })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
            .then((json) => setStarted(json.started_at))
            .catch(() => setError('The clock could not be started.'))
            .finally(() => setSaving(false));
    };

    // Never started and never going to be: the task was closed without anybody
    // recording a start. Worth saying, so the empty columns are explained, but
    // there is nothing here to press.
    if (!started && finished) {
        return (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Time in motion</span>
                <span className="text-xs text-gray-600 dark:text-gray-300">
                    Started <span className="text-gray-400">not recorded</span>
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-300">
                    {completedAt
                        ? <>Completed <span className="text-gray-900 dark:text-gray-100">{formatDate(completedAt)}</span></>
                        : 'Closed'}
                </span>
            </div>
        );
    }

    // Not started: the whole strip is an invitation, so it carries the accent
    // colour rather than sitting quietly among the fields.
    if (!started) {
        return (
            <div className="rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/60 dark:bg-primary-900/20 px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Not started yet</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Starts by itself when this moves into In&nbsp;Progress.
                    </p>
                    {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
                </div>

                {canEdit && (
                    <button
                        type="button"
                        onClick={start}
                        disabled={saving}
                        className="shrink-0 px-3.5 py-1.5 text-sm font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:animate-none transition-colors animate-pulse-glow"
                    >
                        {saving ? 'Starting…' : 'Start now'}
                    </button>
                )}
            </div>
        );
    }

    // Running or finished: a line of facts, no glow — there is nothing to press.
    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Time in motion</span>

            <span className="text-xs text-gray-600 dark:text-gray-300">
                Started <span className="text-gray-900 dark:text-gray-100">{formatDate(started)}</span>
            </span>

            <span className="text-xs text-gray-600 dark:text-gray-300">
                {completedAt
                    ? <>Completed <span className="text-gray-900 dark:text-gray-100">{formatDate(completedAt)}</span></>
                    : finished
                        ? 'Closed'
                        : <span className="text-primary-600 dark:text-primary-400">Still open</span>}
            </span>

            <span className={`text-xs font-semibold tabular-nums ml-auto ${
                finished ? 'text-gray-900 dark:text-gray-100' : 'text-primary-600 dark:text-primary-400'
            }`}>
                {minutes === null ? '—' : formatElapsed(minutes)}
            </span>
        </div>
    );
}
