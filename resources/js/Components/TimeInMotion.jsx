import { useEffect, useState } from 'react';
import { apiFetch, formatDate, formatElapsed, formatMinutes, motionMinutes, parseMinutes, toast } from '../utils';

/**
 * When work actually began, how long it has been going, and the button that
 * puts the clock down for the day.
 *
 * The plan lives in start and due dates; this is the record of what happened.
 * A task is stamped as started on its way into In Progress, but plenty of work
 * begins before anybody moves a card — hence the Start button, which starts the
 * clock from the truth rather than from whenever the status caught up.
 *
 * Pressing Start twice does nothing the second time: the first press was when
 * the work started, and resetting that would quietly shorten the span.
 *
 * Once a task has been in motion across more than one day, the elapsed figure
 * stops meaning much on its own — it counts the nights too. Pause is the answer
 * to that: it records what was actually worked today as a time log, and stops
 * the clock until somebody picks the task up again.
 *
 * Not the same measure as the time logs beside it. Those record effort spent;
 * this records elapsed time, and is normally the larger number.
 */
export default function TimeInMotion({
    projectId,
    taskId,
    startedAt,
    completedAt,
    status = null,
    // The pause state, so the strip can say "paused" and offer Resume. Passed
    // rather than fetched: both hosts already hold the task.
    motionPausedAt = null,
    motionResumedAt = null,
    motionPausedMinutes = 0,
    canEdit = true,
    // Starting the clock also moves the task into In Progress, and the rest of
    // the page is showing that status — so it is told rather than left to
    // disagree with the server until the next reload.
    onStarted = null,
    // Pausing and resuming change the same task record; the host updates its
    // own copy from this rather than reloading the page.
    onMotionChange = null,
}) {
    // Finished work is not waiting to be started. Cancelled counts as finished
    // even though it carries no completion time — only 'done' is stamped — and
    // a cancelled task wants a Start button least of all.
    const finished = !!completedAt || ['done', 'cancelled'].includes(status);
    const [started, setStarted] = useState(startedAt || null);
    const [paused, setPaused] = useState(motionPausedAt || null);
    const [pausedTotal, setPausedTotal] = useState(motionPausedMinutes || 0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    // The pause box: null when closed, otherwise what the server suggests for
    // today plus whatever the person has typed over it.
    const [pauseBox, setPauseBox] = useState(null);
    // Re-rendered on a timer while the task is open, or the elapsed figure
    // would sit frozen at whatever it was when the page loaded.
    const [, setTick] = useState(0);

    useEffect(() => setStarted(startedAt || null), [startedAt]);
    useEffect(() => setPaused(motionPausedAt || null), [motionPausedAt]);
    useEffect(() => setPausedTotal(motionPausedMinutes || 0), [motionPausedMinutes]);

    useEffect(() => {
        // A paused task's elapsed figure does not move, so it needs no heartbeat.
        if (!started || finished || paused) return undefined;

        const id = setInterval(() => setTick((n) => n + 1), 60000);

        return () => clearInterval(id);
    }, [started, finished, paused]);

    const minutes = motionMinutes({
        started_at: started,
        completed_at: completedAt,
        status,
        motion_paused_at: paused,
        motion_paused_minutes: pausedTotal,
    });

    // Only offered once the task has run past the day it began on: work that
    // starts and finishes inside a day needs no per-day capture, because the
    // whole span is the day.
    const spansDays = !!started
        && new Date(started).toDateString() !== new Date(completedAt || Date.now()).toDateString();

    const applyMotion = (json) => {
        setPaused(json.motion_paused_at || null);
        setPausedTotal(json.motion_paused_minutes || 0);
        onMotionChange?.(json);
    };

    const start = () => {
        if (saving || started) return;
        setSaving(true);

        // apiFetch, not Inertia's router: this endpoint answers with JSON, and
        // an Inertia visit expects an Inertia response — it discards a plain
        // JSON reply, so the button appeared to do nothing at all.
        apiFetch(`/projects/${projectId}/tasks/${taskId}/start`, { method: 'PATCH' })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
            .then((json) => {
                setStarted(json.started_at);
                onStarted?.(json);
            })
            .catch(() => setError('The clock could not be started.'))
            .finally(() => setSaving(false));
    };

    /**
     * Open the pause box with the day's figure already in it.
     *
     * The suggestion comes from the server, which knows both where this stretch
     * of work began and how long the person's working day is. It is a starting
     * point, not a reading — whoever presses Pause knows what they actually did.
     */
    const openPause = () => {
        if (saving) return;
        setSaving(true);

        apiFetch(`/projects/${projectId}/tasks/${taskId}/pause-preview`)
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
            .then((json) => setPauseBox({
                duration: minutesToInput(json.suggested_minutes),
                note: '',
                from: json.from,
                alreadyLogged: json.already_logged_today || 0,
            }))
            .catch(() => setError('Could not work out today’s time.'))
            .finally(() => setSaving(false));
    };

    const submitPause = (e) => {
        e.preventDefault();

        const asMinutes = pauseBox.duration.trim() === '' ? 0 : parseMinutes(pauseBox.duration);

        if (asMinutes === null || asMinutes < 0 || asMinutes > 1440) {
            toast('Enter a duration like 1.5, 1:30 or 90m — up to 24 hours.', 'error');
            return;
        }

        setSaving(true);
        apiFetch(`/projects/${projectId}/tasks/${taskId}/pause`, {
            method: 'PATCH',
            body: JSON.stringify({ minutes: asMinutes, note: pauseBox.note || null }),
        })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
            .then((json) => {
                applyMotion(json);
                setPauseBox(null);
                // The time panel on the same page is now out of date by one
                // entry; the timer event is what it already listens to.
                window.dispatchEvent(new CustomEvent('wmt:timer-changed'));
                toast(json.logged_minutes
                    ? `Paused — ${formatMinutes(json.logged_minutes)} logged for today.`
                    : 'Paused. No time logged for today.', 'success');
            })
            .catch(() => toast('Could not pause the clock.', 'error'))
            .finally(() => setSaving(false));
    };

    const resume = () => {
        if (saving) return;
        setSaving(true);

        apiFetch(`/projects/${projectId}/tasks/${taskId}/resume`, { method: 'PATCH' })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
            .then(applyMotion)
            .catch(() => toast('Could not resume the clock.', 'error'))
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

    // Running, paused or finished: a line of facts, and — where the task has
    // run past its first day — the one button that changes what they say.
    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-1">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Time in motion</span>

                <span className="text-xs text-gray-600 dark:text-gray-300">
                    Started <span className="text-gray-900 dark:text-gray-100">{formatDate(started)}</span>
                </span>

                <span className="text-xs text-gray-600 dark:text-gray-300">
                    {completedAt
                        ? <>Completed <span className="text-gray-900 dark:text-gray-100">{formatDate(completedAt)}</span></>
                        : finished
                            ? 'Closed'
                            : paused
                                ? <span className="text-amber-600 dark:text-amber-400">Paused</span>
                                : <span className="text-primary-600 dark:text-primary-400">Still open</span>}
                </span>

                {/* What the pauses have taken out of the elapsed figure. Said
                    out loud, because a number that quietly stopped growing
                    otherwise looks like a bug. */}
                {pausedTotal > 0 && (
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">
                        {formatMinutes(pausedTotal)} paused
                    </span>
                )}

                <span className={`text-xs font-semibold tabular-nums ml-auto ${
                    finished ? 'text-gray-900 dark:text-gray-100'
                        : paused ? 'text-amber-600 dark:text-amber-400'
                            : 'text-primary-600 dark:text-primary-400'
                }`}>
                    {minutes === null ? '—' : formatElapsed(minutes)}
                </span>

                {canEdit && !finished && spansDays && !pauseBox && (
                    paused ? (
                        <button
                            type="button"
                            onClick={resume}
                            disabled={saving}
                            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
                        >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            Resume
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={openPause}
                            disabled={saving}
                            title="Stop the clock for today and record what you worked"
                            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
                        >
                            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>
                            Pause
                        </button>
                    )
                )}
            </div>

            {error && (
                <p className="px-3 pb-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
            )}

            {/* The day's capture. Pre-filled with the time since this stretch
                began, capped at a working day — a suggestion, because only the
                person who did the work knows how much of it was work. */}
            {pauseBox && (
                <form onSubmit={submitPause} className="border-t border-gray-200 dark:border-gray-700 px-3 py-2.5 space-y-2">
                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                                Worked today
                            </label>
                            <input
                                type="text"
                                value={pauseBox.duration}
                                onChange={(e) => setPauseBox({ ...pauseBox, duration: e.target.value })}
                                placeholder="1.5, 1:30, 90m"
                                autoFocus
                                className="w-28 text-xs rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5 px-2"
                            />
                        </div>
                        <div className="flex-1 min-w-[10rem]">
                            <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                                Note (optional)
                            </label>
                            <input
                                type="text"
                                value={pauseBox.note}
                                onChange={(e) => setPauseBox({ ...pauseBox, note: e.target.value })}
                                maxLength={255}
                                className="w-full text-xs rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5 px-2"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={saving}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
                            >
                                {saving ? 'Pausing…' : 'Pause and log'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setPauseBox(null)}
                                className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>

                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                        Counted from {timeOfDay(pauseBox.from)}, capped at your working day.
                        {pauseBox.alreadyLogged > 0 && ` You have already logged ${formatMinutes(pauseBox.alreadyLogged)} on this task today.`}
                        {' '}Wrong afterwards? Ask for a correction on the entry in Time.
                    </p>
                </form>
            )}
        </div>
    );
}

/** "6:30" — the shape the duration box is happiest being handed. */
function minutesToInput(minutes) {
    const m = Math.max(0, Number(minutes) || 0);

    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function timeOfDay(iso) {
    if (!iso) return 'the start of the day';

    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
