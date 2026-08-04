import { useState, useEffect, useCallback, useRef } from 'react';
import { router } from '@inertiajs/react';
import Tooltip from './Tooltip';
import { apiFetch, formatMinutes, taskEditUrl } from '../utils';

/**
 * The running timer, in the top bar.
 *
 * Only rendered when something is actually running, so it costs nothing
 * visually the rest of the time. It listens for `wmt:timer-changed` rather
 * than polling — the task panel announces every start and stop.
 */
export default function RunningTimer() {
    const [running, setRunning] = useState(null);
    const [elapsed, setElapsed] = useState(0);
    const [busy, setBusy] = useState(false);
    const tick = useRef(null);

    const load = useCallback(async () => {
        try {
            const res = await apiFetch('/api/timer');
            if (!res.ok) return;
            const data = await res.json();
            setRunning(data.running || null);
        } catch {
            // Nothing to show is the right failure mode for an indicator.
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const handler = () => load();
        window.addEventListener('wmt:timer-changed', handler);
        return () => window.removeEventListener('wmt:timer-changed', handler);
    }, [load]);

    // Recompute from started_at each tick rather than incrementing a counter,
    // so a backgrounded tab that stops firing intervals still shows the right
    // number the moment it wakes.
    useEffect(() => {
        clearInterval(tick.current);

        if (!running?.started_at) {
            setElapsed(0);
            return;
        }

        const compute = () => {
            const mins = Math.max(0, Math.floor((Date.now() - new Date(running.started_at).getTime()) / 60000));
            setElapsed(mins);
        };

        compute();
        tick.current = setInterval(compute, 30000);

        return () => clearInterval(tick.current);
    }, [running]);

    if (!running) return null;

    const stop = async () => {
        setBusy(true);
        try {
            await apiFetch('/api/timer/stop', { method: 'POST' });
            setRunning(null);
            window.dispatchEvent(new CustomEvent('wmt:timer-changed'));
            // The page behind may be showing a total that just changed.
            router.reload({ only: [] });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex items-center gap-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/30 pl-2.5 pr-1 py-1">
            <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
            </span>

            <button
                type="button"
                onClick={() => running.task_id && router.visit(taskEditUrl({ id: running.task_id, project_id: running.project_id }))}
                className="max-w-32 truncate text-xs font-medium text-primary-700 dark:text-primary-300 hover:underline"
                title={running.task_title || 'Running'}
            >
                {running.task_title || 'Running'}
            </button>

            <span className="text-xs tabular-nums text-primary-700 dark:text-primary-300">
                {formatMinutes(elapsed) === '—' ? '0m' : formatMinutes(elapsed)}
            </span>

            <Tooltip content="Stop timer">
                <button
                    type="button"
                    onClick={stop}
                    disabled={busy}
                    className="p-1 rounded text-primary-600 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-800/50 disabled:opacity-50"
                >
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="1.5" />
                    </svg>
                </button>
            </Tooltip>
        </div>
    );
}
