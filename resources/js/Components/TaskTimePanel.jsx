import { useState, useEffect, useCallback } from 'react';
import Tooltip from './Tooltip';
import { apiFetch, formatMinutes, formatElapsed, parseMinutes, timeAgo, toast } from '../utils';

/**
 * Estimate, logged time and the timer for one task.
 *
 * Timer changes are announced on `wmt:timer-changed` so the header indicator
 * follows along without either component knowing about the other — the same
 * pattern the notification bell already uses.
 */
export default function TaskTimePanel({
    taskId,
    estimatedMinutes,
    canEdit,
    currentUserId,
    // The quick view reports time rather than collecting it: no timer, no
    // manual entry, just the totals and — where the project tracks it — how
    // long the task has actually been running.
    showControls = true,
    elapsedMinutes = null,
    // The quick view wants the duration and nothing else: no logged total, no
    // estimate bar, no list of entries. Those belong on the task itself, where
    // there is room to read them.
    elapsedOnly = false,
    // The slide-in panel is a stack of bordered sections; a card supplies its
    // own frame and padding, so the wrapper has to be able to step out of the
    // way.
    className = 'px-6 py-4 border-t border-gray-200 dark:border-gray-700',
}) {
    const [logs, setLogs] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [adding, setAdding] = useState(false);
    const [duration, setDuration] = useState('');
    const [note, setNote] = useState('');
    const [loggedOn, setLoggedOn] = useState(() => new Date().toISOString().slice(0, 10));

    const running = logs.find((l) => l.running && l.user_id === currentUserId);

    const load = useCallback(async () => {
        try {
            const res = await apiFetch(`/api/tasks/${taskId}/time-logs`);
            if (!res.ok) return;
            const data = await res.json();
            setLogs(data.logs || []);
            setTotal(data.total_minutes || 0);
        } catch {
            // A failed load leaves the panel empty rather than breaking the
            // whole task view around it.
        } finally {
            setLoading(false);
        }
    }, [taskId]);

    useEffect(() => {
        if (elapsedOnly) { setLoading(false); return; }

        setLoading(true);
        load();
    }, [load, elapsedOnly]);

    // Another task's panel, or the header, stopped our timer.
    useEffect(() => {
        const handler = () => load();
        window.addEventListener('wmt:timer-changed', handler);
        return () => window.removeEventListener('wmt:timer-changed', handler);
    }, [load]);

    const announce = () => window.dispatchEvent(new CustomEvent('wmt:timer-changed'));

    const toggleTimer = async () => {
        setBusy(true);
        try {
            const url = running ? '/api/timer/stop' : `/api/tasks/${taskId}/timer/start`;
            const res = await apiFetch(url, { method: 'POST' });
            if (!res.ok) throw new Error();

            const data = await res.json();
            if (!running && data.stopped) {
                toast(`Stopped the timer on ${data.stopped.task_title || 'the previous task'}.`);
            }
            await load();
            announce();
        } catch {
            toast('Could not change the timer.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const addManual = async (e) => {
        e.preventDefault();

        if (parseMinutes(duration) === null) {
            toast('Enter a duration like 1.5, 1:30 or 90m.', 'error');
            return;
        }

        setBusy(true);
        try {
            const res = await apiFetch(`/api/tasks/${taskId}/time-logs`, {
                method: 'POST',
                body: JSON.stringify({ duration, logged_on: loggedOn, note: note || null }),
            });
            if (!res.ok) throw new Error();

            setDuration('');
            setNote('');
            setAdding(false);
            await load();
        } catch {
            toast('Could not save that entry.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id) => {
        setBusy(true);
        try {
            await apiFetch(`/api/time-logs/${id}`, { method: 'DELETE' });
            await load();
            announce();
        } finally {
            setBusy(false);
        }
    };

    // Over-estimate is worth seeing, so the bar is capped at 100% but the
    // numbers beside it are not.
    const pct = estimatedMinutes > 0 ? Math.min(100, Math.round((total / estimatedMinutes) * 100)) : null;
    const over = estimatedMinutes > 0 && total > estimatedMinutes;

    // A heading with nothing under it is worse than no section: when there is
    // no elapsed time to report, this mode has nothing to say.
    if (elapsedOnly && elapsedMinutes === null) return null;

    return (
        <div className={className}>
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</h4>
                {canEdit && showControls && (
                    <button
                        type="button"
                        onClick={toggleTimer}
                        disabled={busy}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                            running
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : 'bg-primary-600 text-white hover:bg-primary-700'
                        }`}
                    >
                        {running ? (
                            <>
                                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
                                Stop
                            </>
                        ) : (
                            <>
                                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                Start timer
                            </>
                        )}
                    </button>
                )}
            </div>

            {!elapsedOnly && (
                <div className="flex items-baseline gap-2 text-sm">
                    <span className={`font-medium ${over ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                        {formatMinutes(total)}
                    </span>
                    <span className="text-xs text-gray-400">
                        {estimatedMinutes > 0 ? `logged of ${formatMinutes(estimatedMinutes)} estimated` : 'logged · no estimate set'}
                    </span>
                </div>
            )}

            {!elapsedOnly && pct !== null && (
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                        className={`h-full rounded-full ${over ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            )}

            {!elapsedOnly && running && (
                <p className="mt-2 text-xs text-primary-600 dark:text-primary-400">
                    Running since {timeAgo(running.started_at)}
                </p>
            )}

            {/* Elapsed time, where the project records when work began. A
                different measure from the logged total above it: that is effort
                spent, this is how long the task has been open, and it is
                normally the larger of the two. */}
            {elapsedMinutes !== null && (
                <div className={`${elapsedOnly ? '' : 'mt-2 '}flex items-baseline gap-2 text-sm`}>
                    <span className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                        {formatElapsed(elapsedMinutes)}
                    </span>
                    <span className="text-xs text-gray-400">elapsed since work started</span>
                </div>
            )}

            {!elapsedOnly && !loading && logs.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                    {logs.filter((l) => !l.running).map((log) => (
                        <li key={log.id} className="group flex items-center gap-2 text-xs">
                            <span className="w-14 shrink-0 tabular-nums text-gray-900 dark:text-gray-100">{log.duration}</span>
                            <span className="w-20 shrink-0 text-gray-400">{log.logged_on}</span>
                            <span className="flex-1 min-w-0 truncate text-gray-500 dark:text-gray-400">
                                {log.user}{log.note ? ` — ${log.note}` : ''}
                            </span>
                            {(log.user_id === currentUserId || canEdit) && (
                                <Tooltip content="Delete entry">
                                    <button
                                        type="button"
                                        onClick={() => remove(log.id)}
                                        disabled={busy}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                                    >
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </Tooltip>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {canEdit && showControls && !adding && (
                <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="mt-2 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                >
                    + Log time manually
                </button>
            )}

            {canEdit && showControls && adding && (
                <form onSubmit={addManual} className="mt-3 space-y-2">
                    <div className="flex gap-2">
                        <input
                            type="text" value={duration} onChange={(e) => setDuration(e.target.value)}
                            placeholder="1.5, 1:30, 90m" autoFocus
                            className="w-28 text-xs rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5 px-2"
                        />
                        <input
                            type="date" value={loggedOn} onChange={(e) => setLoggedOn(e.target.value)}
                            className="text-xs rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5 px-2"
                        />
                    </div>
                    <input
                        type="text" value={note} onChange={(e) => setNote(e.target.value)}
                        placeholder="Note (optional)" maxLength={255}
                        className="w-full text-xs rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5 px-2"
                    />
                    <div className="flex gap-2">
                        <button type="submit" disabled={busy || !duration.trim()}
                            className="px-2.5 py-1 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 disabled:opacity-50">
                            Save
                        </button>
                        <button type="button" onClick={() => { setAdding(false); setDuration(''); setNote(''); }}
                            className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
