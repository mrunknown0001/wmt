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
 * Pressing it twice does nothing the second time: the first press was when the
 * work started, and resetting that would quietly shorten the span.
 *
 * Not the same measure as the time logs beside it. Those record effort spent;
 * this records elapsed time, and is normally the larger number.
 */
export default function TimeInMotion({ projectId, taskId, startedAt, completedAt, canEdit = true }) {
    const [started, setStarted] = useState(startedAt || null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    // Re-rendered on a timer while the task is open, or the elapsed figure
    // would sit frozen at whatever it was when the page loaded.
    const [, setTick] = useState(0);

    useEffect(() => setStarted(startedAt || null), [startedAt]);

    useEffect(() => {
        if (!started || completedAt) return undefined;

        const id = setInterval(() => setTick((n) => n + 1), 60000);

        return () => clearInterval(id);
    }, [started, completedAt]);

    const minutes = (() => {
        if (!started) return null;
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

    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Time in motion</h3>
                {!started && canEdit && (
                    <button
                        type="button"
                        onClick={start}
                        disabled={saving}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
                    >
                        {saving ? 'Starting…' : 'Start now'}
                    </button>
                )}
            </div>

            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                    <dt className="text-gray-500 dark:text-gray-400">Started</dt>
                    <dd className="text-gray-900 dark:text-gray-100">
                        {started ? formatDate(started) : <span className="text-gray-400">Not yet</span>}
                    </dd>
                </div>
                <div>
                    <dt className="text-gray-500 dark:text-gray-400">Completed</dt>
                    <dd className="text-gray-900 dark:text-gray-100">
                        {completedAt ? formatDate(completedAt) : <span className="text-gray-400">Open</span>}
                    </dd>
                </div>
                <div>
                    <dt className="text-gray-500 dark:text-gray-400">Elapsed</dt>
                    <dd className={completedAt
                        ? 'text-gray-900 dark:text-gray-100 tabular-nums'
                        : 'text-primary-600 dark:text-primary-400 tabular-nums'}>
                        {minutes === null ? <span className="text-gray-400">—</span> : formatElapsed(minutes)}
                    </dd>
                </div>
            </dl>

            {error && (
                <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
            )}

            {!started && (
                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                    Stamped automatically when this task moves into In&nbsp;Progress.
                </p>
            )}
        </div>
    );
}
