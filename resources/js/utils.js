export const formatLabel = (value) =>
    value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const projectStatusColors = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    on_hold: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    archived: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
};

export const taskStatusColors = {
    backlog: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300',
    to_do: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    in_review: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    done: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export const priorityColors = {
    low: 'bg-gray-100 text-gray-700 dark:bg-gray-700/40 dark:text-gray-300',
    medium: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    urgent: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export function apiFetch(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content,
        'Accept': 'application/json',
        ...options.headers,
    };

    // Include socket ID so Laravel's toOthers() can exclude the sender
    if (window.Echo?.socketId?.()) {
        headers['X-Socket-ID'] = window.Echo.socketId();
    }

    return fetch(url, { ...options, headers });
}

/**
 * Raise a toast from anywhere, including plain JSON/fetch paths that never go
 * through Inertia's flash props. AuthenticatedLayout listens for this event.
 */
export function toast(message, type = 'error') {
    if (!message) return;
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, type } }));
}

/**
 * Pull a human-readable message out of a failed JSON response. Handles Laravel's
 * 422 shape ({message, errors:{field:[...]}}) and falls back to a default.
 */
export async function errorMessageFrom(response, fallback = 'Something went wrong.') {
    try {
        const json = await response.clone().json();
        const firstFieldError = json?.errors && Object.values(json.errors)?.[0]?.[0];
        return firstFieldError || json?.message || fallback;
    } catch {
        return fallback;
    }
}

/**
 * Turn a stored date into a Date the browser will read as the intended day.
 *
 * A bare "YYYY-MM-DD" is parsed by JavaScript as UTC midnight, so west of
 * Greenwich it renders as the day before. Building it from the parts instead
 * pins it to local midnight, which is what a date-only value means: a day on a
 * calendar, not an instant.
 *
 * Anything carrying a time (created_at, completed_at) is a real instant and is
 * left to the normal parser.
 */
export const parseDate = (value) => {
    if (!value) return null;

    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    if (dateOnly) {
        const [, y, m, d] = dateOnly;
        return new Date(Number(y), Number(m) - 1, Number(d));
    }

    const parsed = new Date(value);
    return isNaN(parsed) ? null : parsed;
};

export const formatDate = (value) => {
    if (!value) return null;
    const date = parseDate(value);
    if (!date) return value;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/** Local midnight at the start of today — the line a due date is late after. */
export const startOfToday = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

/** True when a date-only due date has passed. */
export const isPastDue = (value) => {
    const date = parseDate(value);
    return !!date && date < startOfToday();
};

/**
 * The moment a task is actually late — its due time, or the end of the due day
 * when no time is set.
 *
 * Mirrors Task::dueAt() on the server, so "late" means the same thing in the
 * browser as it does in a report.
 */
export const dueAt = (task) => {
    const date = parseDate(task?.due_date);
    if (!date) return null;

    if (!task.due_time) {
        date.setHours(23, 59, 59, 999);
        return date;
    }

    const [h, m] = String(task.due_time).split(':');
    date.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
    return date;
};

/**
 * True when a finished task was finished after its deadline.
 *
 * A task with no due date can never be late — it had no deadline to miss, and
 * counting it as late would make the figure meaningless.
 */
/**
 * How many days past its due date an unfinished task is, or 0.
 *
 * Date-only, like Task::scopePastDue on the server — a task due today is not
 * late until the day is out. Keeping the two in step matters: a banner saying
 * "overdue" on a task the dashboard does not count would be worse than no
 * banner at all.
 */
export const overdueDays = (task) => {
    if (!task?.due_date || ['done', 'cancelled'].includes(task.status)) return 0;

    const due = parseDate(task.due_date);
    if (!due) return 0;

    const today = startOfToday();
    if (due >= today) return 0;

    return Math.round((today - due) / 86400000);
};

/**
 * Due today, with a due time that has already gone by.
 *
 * Not overdue by the app's date-only rule, but worth saying on a detail page
 * where the hour is shown — flagged separately so it cannot be mistaken for
 * the counted kind.
 */
export const isDueEarlierToday = (task) => {
    if (!task?.due_date || !task?.due_time) return false;
    if (['done', 'cancelled'].includes(task.status)) return false;

    const due = parseDate(task.due_date);
    if (!due || due.getTime() !== startOfToday().getTime()) return false;

    return new Date() > dueAt(task);
};

export const isCompletedLate = (task) => {
    if (!task?.completed_at || !task?.due_date) return false;

    const deadline = dueAt(task);
    return !!deadline && new Date(task.completed_at) > deadline;
};

/**
 * Whole days between the day a task was due and the day it was finished.
 *
 * Positive is late, negative is early, zero means it landed on the day. Null
 * when either date is missing, which is not the same as zero — "finished the
 * day it was due" and "had no deadline" must not read alike.
 *
 * Measured by calendar day rather than against the deadline moment, to match
 * overdueDays and every other count in the app. A task closed at 6pm on its due
 * date is late by isCompletedLate and on time here; both are true, and this is
 * the one worth saying out loud.
 */
export const completionDelta = (task) => {
    if (!task?.completed_at || !task?.due_date) return null;

    const due = parseDate(task.due_date);
    const finished = parseDate(task.completed_at);
    if (!due || !finished) return null;

    const finishedDay = new Date(finished.getFullYear(), finished.getMonth(), finished.getDate());
    return Math.round((finishedDay - due) / 86400000);
};

/** "1h 30m", "45m", "—". Mirrors TimeTracker::formatMinutes on the server. */
export const formatMinutes = (minutes) => {
    const m = Number(minutes);
    if (!m || m <= 0) return '—';
    const hours = Math.floor(m / 60);
    const rest = m % 60;
    if (hours === 0) return `${rest}m`;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

/**
 * Read a typed duration: "1.5", "1:30" or "90m" all mean ninety minutes.
 * Returns null when it cannot be read, so callers can show an error rather
 * than silently storing a zero.
 */
export const parseMinutes = (input) => {
    const text = String(input ?? '').trim();
    if (!text) return null;

    let m = /^(\d+):([0-5]?\d)$/.exec(text);
    if (m) return Number(m[1]) * 60 + Number(m[2]);

    m = /^(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?$/i.exec(text);
    if (m) return Math.round(Number(m[1]));

    m = /^(\d+(?:\.\d+)?)\s*h?(?:ours?|rs?)?$/i.exec(text);
    if (m) return Math.round(Number(m[1]) * 60);

    return null;
};

export const timeAgo = (dateString) => {
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    const intervals = [
        [31536000, 'year'], [2592000, 'month'], [604800, 'week'],
        [86400, 'day'], [3600, 'hour'], [60, 'minute'],
    ];
    for (const [secs, label] of intervals) {
        const count = Math.floor(seconds / secs);
        if (count >= 1) return `${count} ${label}${count > 1 ? 's' : ''} ago`;
    }
    return 'just now';
};

export const svgStatusColors = {
    backlog: '#9ca3af', to_do: '#3b82f6', in_progress: '#eab308',
    in_review: '#a855f7', done: '#22c55e', cancelled: '#ef4444',
};

export const svgPriorityColors = {
    low: '#9ca3af', medium: '#3b82f6', high: '#f97316', urgent: '#ef4444',
};

export const taskEditUrl = (task) => {
    if (task.project_id) {
        return `/projects/${task.project_id}/tasks/${task.id}/edit`;
    }
    return `/tasks/${task.id}/edit`;
};

export const getInitials = (name) => {
    if (!name) return '?';
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
};
