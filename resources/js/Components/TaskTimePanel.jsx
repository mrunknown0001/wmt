import { useState, useEffect, useCallback } from 'react';
import Tooltip from './Tooltip';
import { apiFetch, errorMessageFrom, formatMinutes, formatElapsed, parseMinutes, toast } from '../utils';

/**
 * Estimate and recorded time for one task.
 *
 * Nothing here starts a clock or types in an afternoon any more. The figures
 * are worked out from the task's own clock — see the Time in motion strip — and
 * this reports them, says which of them a person stood behind, and offers the
 * two ways to argue with them: correct an entry, or ask for one on a day the
 * clock never ran.
 *
 * Changes are announced on `wmt:timer-changed`, which the motion strip also
 * raises when it pauses, so the two stay in step without either knowing about
 * the other.
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
    // Asking for an entry on a day with none: the replacement for typing one
    // straight in.
    const [adding, setAdding] = useState(false);
    const [duration, setDuration] = useState('');
    const [reason, setReason] = useState('');
    // Today according to the application, not to the browser: those are
    // different days for anybody whose timezone is not the server's.
    const [today, setToday] = useState(null);
    const [loggedOn, setLoggedOn] = useState('');
    // Corrections: whether this reader decides them, whether this task can have
    // them at all, and which entry is being corrected right now.
    const [canReview, setCanReview] = useState(false);
    const [amendmentsAvailable, setAmendmentsAvailable] = useState(false);
    const [amending, setAmending] = useState(null);   // { logId, duration, reason }

    const load = useCallback(async () => {
        try {
            const res = await apiFetch(`/api/tasks/${taskId}/time-logs`);
            if (!res.ok) return;
            const data = await res.json();
            setLogs(data.logs || []);
            setTotal(data.total_minutes || 0);
            setCanReview(!!data.can_review_amendments);
            setAmendmentsAvailable(!!data.amendments_available);
            if (data.today) {
                setToday(data.today);
                setLoggedOn((prev) => prev || data.today);
            }
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

    /**
     * Ask for an entry on a day the clock never ran.
     *
     * Goes through the same approval as a correction, and lands as a figure the
     * generator will not revise. Somebody who runs the project is not asking
     * anybody, so theirs takes effect at once.
     */
    const requestEntry = async (e) => {
        e.preventDefault();

        if (parseMinutes(duration) === null) {
            toast('Enter a duration like 1.5, 1:30 or 90m.', 'error');
            return;
        }

        setBusy(true);
        try {
            const res = await apiFetch(`/api/tasks/${taskId}/time-log-amendments`, {
                method: 'POST',
                body: JSON.stringify({ duration, logged_on: loggedOn, reason }),
            });
            if (!res.ok) throw new Error(await errorMessageFrom(res, 'Could not send that request.'));

            const data = await res.json();
            setDuration('');
            setReason('');
            setAdding(false);
            await load();
            announce();
            toast(data.applied ? 'Entry added.' : 'Entry sent for approval.', 'success');
        } catch (err) {
            toast(err.message || 'Could not send that request.', 'error');
        } finally {
            setBusy(false);
        }
    };

    /**
     * Ask for an entry to be corrected.
     *
     * Nothing changes on the strength of the request: the figure stands until
     * whoever runs the project decides. Unless the person asking is that
     * somebody, in which case there is nobody left to ask and it applies.
     */
    const submitAmendment = async (e) => {
        e.preventDefault();

        if (parseMinutes(amending.duration) === null) {
            toast('Enter a duration like 1.5, 1:30 or 90m.', 'error');
            return;
        }

        setBusy(true);
        try {
            const res = await apiFetch(`/api/time-logs/${amending.logId}/amendments`, {
                method: 'POST',
                body: JSON.stringify({ duration: amending.duration, reason: amending.reason }),
            });
            if (!res.ok) throw new Error(await errorMessageFrom(res, 'Could not send that correction.'));

            const data = await res.json();
            setAmending(null);
            await load();
            announce();
            toast(data.applied
                ? 'Entry corrected.'
                : 'Correction sent for approval.', 'success');
        } catch (err) {
            toast(err.message || 'Could not send that correction.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const decide = async (amendmentId, verdict) => {
        setBusy(true);
        try {
            const res = await apiFetch(`/api/time-log-amendments/${amendmentId}/${verdict}`, { method: 'POST' });
            if (!res.ok) throw new Error(await errorMessageFrom(res, 'Could not record that decision.'));

            await load();
            announce();
            toast(verdict === 'approve' ? 'Correction approved.' : 'Correction turned down.', 'success');
        } catch (err) {
            toast(err.message || 'Could not record that decision.', 'error');
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
            </div>

            {!elapsedOnly && (
                <div className="flex items-baseline gap-2 text-sm">
                    <span className={`font-medium ${over ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                        {formatMinutes(total)}
                    </span>
                    <span className="text-xs text-gray-400">
                        {estimatedMinutes > 0 ? `recorded of ${formatMinutes(estimatedMinutes)} estimated` : 'recorded · no estimate set'}
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
                    {logs.map((log) => {
                        // Yours to correct, or anyone's if you run the project.
                        // Never on a task with no project: there would be
                        // nobody to approve it.
                        const mine = log.user_id === currentUserId;
                        const canAmend = amendmentsAvailable && (mine || canReview) && !log.pending_amendment;

                        return (
                        <li key={log.id} className="group text-xs">
                            <div className="flex items-center gap-2">
                                <span className="w-14 shrink-0 tabular-nums text-gray-900 dark:text-gray-100">{log.duration}</span>
                                <span className="w-20 shrink-0 text-gray-400">{log.logged_on}</span>
                                <span className="flex-1 min-w-0 truncate text-gray-500 dark:text-gray-400">
                                    {log.user}{log.note ? ` — ${log.note}` : ''}
                                    {/* An amended figure should not pass for an
                                        untouched one. */}
                                    {log.amended && <span className="ml-1 text-[10px] text-gray-400">(amended)</span>}
                                    {!log.amended && (
                                        <span className="ml-1 text-[10px] text-gray-400">
                                            {log.generated ? '(from the clock)' : '(entered)'}
                                        </span>
                                    )}
                                </span>
                                {canAmend && (
                                    <Tooltip content="Ask for this entry to be corrected">
                                        <button
                                            type="button"
                                            onClick={() => setAmending({ logId: log.id, duration: '', reason: '' })}
                                            disabled={busy}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                                        >
                                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        </button>
                                    </Tooltip>
                                )}
                                {(mine || canEdit) && !log.generated && (
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
                            </div>

                            {/* A correction waiting on a decision. Shown to
                                everybody who can see the entry — the person who
                                asked needs to know it is still pending, and the
                                person who decides needs somewhere to decide. */}
                            {log.pending_amendment && (
                                <div className="mt-1 ml-1 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/20 px-2 py-1.5">
                                    <p className="text-[11px] text-amber-800 dark:text-amber-300">
                                        <span className="font-medium">{log.pending_amendment.requester || 'Someone'}</span>
                                        {' asks for '}
                                        <span className="font-medium">{log.pending_amendment.original_duration}</span>
                                        {' → '}
                                        <span className="font-medium">{log.pending_amendment.requested_duration}</span>
                                    </p>
                                    <p className="text-[11px] text-amber-700/90 dark:text-amber-400/90 mt-0.5">
                                        {log.pending_amendment.reason}
                                    </p>
                                    {canReview ? (
                                        <div className="mt-1.5 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => decide(log.pending_amendment.id, 'approve')}
                                                disabled={busy}
                                                className="px-2 py-0.5 rounded-md bg-green-600 text-white text-[11px] font-medium hover:bg-green-700 disabled:opacity-50"
                                            >
                                                Approve
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => decide(log.pending_amendment.id, 'reject')}
                                                disabled={busy}
                                                className="px-2 py-0.5 rounded-md border border-gray-300 dark:border-gray-600 text-[11px] text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-50"
                                            >
                                                Turn down
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="mt-0.5 text-[11px] text-amber-600/80 dark:text-amber-400/70">
                                            Waiting on the project owner.
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* What it should say instead, and why. The reason
                                is required: it is the whole record of a figure
                                that no longer matches what the timer saw. */}
                            {amending?.logId === log.id && (
                                <form onSubmit={submitAmendment} className="mt-1 ml-1 rounded-md border border-gray-200 dark:border-gray-700 px-2 py-2 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] text-gray-500 dark:text-gray-400">Should be</span>
                                        <input
                                            type="text"
                                            value={amending.duration}
                                            onChange={(e) => setAmending({ ...amending, duration: e.target.value })}
                                            placeholder="1.5, 1:30, 90m"
                                            autoFocus
                                            className="w-28 text-xs rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1 px-2"
                                        />
                                        <span className="text-[11px] text-gray-400">instead of {log.duration}</span>
                                    </div>
                                    <input
                                        type="text"
                                        value={amending.reason}
                                        onChange={(e) => setAmending({ ...amending, reason: e.target.value })}
                                        placeholder="Why — e.g. forgot to stop the timer"
                                        maxLength={1000}
                                        className="w-full text-xs rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1 px-2"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="submit"
                                            disabled={busy || !amending.duration.trim() || !amending.reason.trim()}
                                            className="px-2.5 py-1 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 disabled:opacity-50"
                                        >
                                            {canReview ? 'Correct entry' : 'Ask for approval'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAmending(null)}
                                            className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            )}
                        </li>
                        );
                    })}
                </ul>
            )}

            {/* The clock cannot record what it never saw. This is the way back
                in for a day spent away from it — and it goes through the same
                approval as any other change to the record. */}
            {canEdit && showControls && amendmentsAvailable && !adding && (
                <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="mt-2 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                >
                    + Ask for an entry
                </button>
            )}

            {canEdit && showControls && adding && (
                <form onSubmit={requestEntry} className="mt-3 space-y-2">
                    <div className="flex gap-2">
                        <input
                            type="text" value={duration} onChange={(e) => setDuration(e.target.value)}
                            placeholder="1.5, 1:30, 90m" autoFocus
                            className="w-28 text-xs rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5 px-2"
                        />
                        <input
                            type="date" value={loggedOn} max={today || undefined}
                            onChange={(e) => setLoggedOn(e.target.value)}
                            className="text-xs rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5 px-2"
                        />
                    </div>
                    <input
                        type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                        placeholder="Why the clock missed it — e.g. on site, no laptop"
                        maxLength={1000}
                        className="w-full text-xs rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5 px-2"
                    />
                    <div className="flex gap-2">
                        <button type="submit" disabled={busy || !duration.trim() || !reason.trim()}
                            className="px-2.5 py-1 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 disabled:opacity-50">
                            {canReview ? 'Add entry' : 'Ask for approval'}
                        </button>
                        <button type="button" onClick={() => { setAdding(false); setDuration(''); setReason(''); setLoggedOn(today || ''); }}
                            className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
