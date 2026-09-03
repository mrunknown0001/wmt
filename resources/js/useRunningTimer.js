import { useEffect, useState } from 'react';
import { apiFetch } from './utils';

/**
 * Which task the viewer has a timer running on, or null.
 *
 * Shared rather than per-component: a task list can hold hundreds of rows, and
 * each one asking the server the same question would be hundreds of requests
 * for one answer. The value is fetched once, kept here, and handed to every
 * subscriber.
 *
 * No polling either — the header indicator already announces every start and
 * stop on `wmt:timer-changed`, and this listens to the same event.
 *
 * Only ever the viewer's own timer. The endpoint answers for the current user,
 * and a colleague's running entry is not something this can know about.
 */
let current = null;
let loaded = false;
let inFlight = null;
const subscribers = new Set();

function publish(taskId) {
    current = taskId;
    loaded = true;
    subscribers.forEach((fn) => fn(taskId));
}

function load() {
    // One request even when twenty rows mount at once.
    if (inFlight) return inFlight;

    inFlight = apiFetch('/api/timer')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => publish(data?.running?.task_id ?? null))
        // No marker is the right failure mode for a hint: a list that cannot
        // reach the timer should still render.
        .catch(() => publish(null))
        .finally(() => { inFlight = null; });

    return inFlight;
}

export default function useRunningTimer() {
    const [taskId, setTaskId] = useState(current);

    useEffect(() => {
        subscribers.add(setTaskId);

        if (!loaded) {
            load();
        } else {
            setTaskId(current);
        }

        const refresh = () => load();
        window.addEventListener('wmt:timer-changed', refresh);

        return () => {
            subscribers.delete(setTaskId);
            window.removeEventListener('wmt:timer-changed', refresh);
        };
    }, []);

    return taskId;
}
