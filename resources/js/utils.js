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
    return fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content,
            'Accept': 'application/json',
            ...options.headers,
        },
    });
}

export const formatDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (isNaN(date)) return value;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
