import { useMemo, useState } from 'react';
import { Link, router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Avatar from '../../Components/Avatar';
import InfoTip from '../../Components/InfoTip';
import Modal from '../../Components/Modal';
import Button from '../../Components/Button';
import Input from '../../Components/Input';
import SearchableSelect from '../../Components/SearchableSelect';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const today = () => new Date().toISOString().slice(0, 10);

// Activity tier from the last-30-days action count.
const activityTier = (n) => {
    if (n >= 20) return { label: 'Very Active', cls: 'text-green-600 dark:text-green-400', dot: 'bg-green-500' };
    if (n >= 8) return { label: 'Active', cls: 'text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' };
    if (n >= 1) return { label: 'Low Activity', cls: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' };
    return { label: 'Inactive', cls: 'text-gray-500 dark:text-gray-400', dot: 'bg-gray-400' };
};

const rateColor = (r) => (r >= 75 ? 'text-green-600 dark:text-green-400' : r >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400');
const barColor = (r) => (r >= 75 ? 'bg-green-500' : r >= 40 ? 'bg-amber-500' : 'bg-red-500');

const PRODUCTIVITY_TIP = 'Weighted score: 50% Completion Rate + 30% On-Time Rate + 20% Activity. Activity is this user’s actions over the last 30 days, counting up to 20 (each action = 5 points, capped at 100).';

const CLOSED = ['done', 'cancelled'];

const STATUS_PILL = {
    backlog: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-700/40 dark:text-gray-300 dark:border-gray-600',
    to_do: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-700/40 dark:text-gray-300 dark:border-gray-600',
    in_progress: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    in_review: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800',
    done: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
    cancelled: 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-700/40 dark:text-gray-400 dark:border-gray-600',
    // Project statuses
    active: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
    on_hold: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    completed: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    archived: 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-700/40 dark:text-gray-400 dark:border-gray-600',
};

const formatLabel = (s) => (s ? s.replace(/_/g, ' ') : '');

function Badge({ status }) {
    return (
        <span className={`shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border ${STATUS_PILL[status] || STATUS_PILL.to_do}`}>
            {formatLabel(status)}
        </span>
    );
}

function Meter({ label, value, suffix = '%', tip, onClick, active }) {
    const body = (
        <div>
            <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm text-gray-600 dark:text-gray-400 inline-flex items-center gap-1">
                    {label}{tip && <InfoTip text={tip} />}
                </span>
                <span className={`text-sm font-semibold ${rateColor(value)}`}>{value}{suffix}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div className={`h-full rounded-full ${barColor(value)}`} style={{ width: `${Math.min(100, value)}%` }} />
            </div>
        </div>
    );

    if (!onClick) return body;

    return (
        <button
            type="button"
            onClick={onClick}
            className={`block w-full text-left rounded-lg -mx-2 px-2 py-1.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40 ${active ? 'bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-300 dark:ring-primary-700' : ''}`}
        >
            {body}
        </button>
    );
}

function Stat({ label, value, accent = '', tip, onClick, active }) {
    const inner = (
        <>
            <p className={`text-3xl font-bold ${accent || 'text-gray-900 dark:text-gray-100'}`}>{value}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 inline-flex items-center gap-1">
                {label}{tip && <InfoTip text={tip} />}
            </p>
        </>
    );

    if (!onClick) return <Card>{inner}</Card>;

    return (
        <button type="button" onClick={onClick} className="block w-full h-full text-left">
            <Card className={`h-full cursor-pointer transition-shadow hover:shadow-md ${active ? 'ring-2 ring-primary-400 dark:ring-primary-600' : ''}`}>
                {inner}
            </Card>
        </button>
    );
}

const PRIORITY_PILL = {
    urgent: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
    high: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
    medium: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    low: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-700/40 dark:text-gray-300 dark:border-gray-600',
};

/** "Today", "Tomorrow", or "Tue 12 Aug". */
function dueLabel(value) {
    if (!value) return '';

    const [y, m, d] = value.split('-').map(Number);
    const due = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((due - today) / 86400000);

    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';

    return due.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "14:00" from a stored time of any precision. */
const timeLabel = (value) => (value ? String(value).slice(0, 5) : null);

const ReassignIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
);

/**
 * One task line, shared by the Tasks card and the filtered list. The row links
 * to the task; the reassign button sits outside that link so it can act on its
 * own without also navigating.
 */
function TaskRow({ task, canArrangeCover, onReassign, showStatus }) {
    const reassignable = task.reassignable ?? !CLOSED.includes(task.status);
    const overdue = task.days_late != null || task.is_overdue;
    const done = task.status === 'done';

    return (
        <li className="flex items-center gap-2 px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <Link href={task.url} className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-24 shrink-0">
                    {done ? (
                        <p className="text-xs font-medium text-green-600 dark:text-green-400">
                            Done{task.completed_at ? ` ${dueLabel(task.completed_at)}` : ''}
                        </p>
                    ) : task.due_date ? (
                        <>
                            <p className={`text-xs font-medium ${overdue ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                                {dueLabel(task.due_date)}
                            </p>
                            {task.days_late != null ? (
                                <p className="text-xs text-red-500 dark:text-red-400">
                                    {task.days_late} {task.days_late === 1 ? 'day' : 'days'} late
                                </p>
                            ) : timeLabel(task.due_time) && (
                                <p className="text-xs text-gray-400">{timeLabel(task.due_time)}</p>
                            )}
                        </>
                    ) : (
                        <p className="text-xs text-gray-400 dark:text-gray-500">No due date</p>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{task.title}</p>
                    {task.project && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{task.project.name}</p>
                    )}
                </div>
            </Link>

            {showStatus && <Badge status={task.status} />}

            <span className={`shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border ${PRIORITY_PILL[task.priority] || PRIORITY_PILL.low}`}>
                {task.priority}
            </span>

            {canArrangeCover && reassignable && (
                <button
                    type="button"
                    onClick={() => onReassign(task)}
                    title="Reassign temporarily"
                    className="shrink-0 p-1.5 text-gray-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                >
                    <ReassignIcon />
                </button>
            )}
        </li>
    );
}

function UpcomingTasks({ upcoming, name, canArrangeCover, onReassign }) {
    const {
        tasks = [], overdue = [],
        weekCount = 0, monthCount = 0, overdueCount = 0, limit = 50,
    } = upcoming || {};

    // Overdue work is what needs attention, so the card opens on it when there
    // is any. Otherwise it opens on the week ahead.
    const [range, setRange] = useState(overdueCount > 0 ? 'overdue' : 'week');

    const shown = useMemo(() => {
        if (range === 'overdue') return overdue;
        return tasks.filter((t) => (range === 'week' ? t.in_week : t.in_month));
    }, [tasks, overdue, range]);

    const total = { overdue: overdueCount, week: weekCount, month: monthCount }[range];
    const hidden = Math.max(0, total - shown.length);

    const emptyMessage = {
        overdue: 'Nothing overdue.',
        week: `Nothing due for ${name.split(' ')[0]} for the rest of this week.`,
        month: `Nothing due for ${name.split(' ')[0]} for the rest of this month.`,
    }[range];

    const tab = (key, label, count, danger = false) => (
        <button
            type="button"
            onClick={() => setRange(key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                range === key
                    ? danger
                        ? 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                    : danger && count > 0
                        ? 'text-red-600 hover:text-red-700 dark:text-red-400'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
        >
            {label}
            <span className="ml-1.5 text-xs tabular-nums opacity-70">{count}</span>
        </button>
    );

    return (
        <Card className="mb-6" padding={false}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Tasks</h3>
                <div className="flex items-center gap-1">
                    {tab('overdue', 'Overdue', overdueCount, true)}
                    {tab('week', 'This week', weekCount)}
                    {tab('month', 'This month', monthCount)}
                </div>
            </div>

            {shown.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                    {emptyMessage}
                </p>
            ) : (
                <>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-96 overflow-y-auto">
                        {shown.map((task) => (
                            <TaskRow key={task.id} task={task} canArrangeCover={canArrangeCover} onReassign={onReassign} />
                        ))}
                    </ul>
                    {hidden > 0 && (
                        <p className="px-6 py-2.5 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
                            Showing the first {limit} — {hidden} more due in this period.
                        </p>
                    )}
                </>
            )}
        </Card>
    );
}

/** The records behind a clicked card: tasks, projects, or activity. */
function FilteredPanel({ filtered, onClear, canArrangeCover, onReassign }) {
    const { type, label, items, count, limit } = filtered;
    const hidden = Math.max(0, count - items.length);

    return (
        <Card className="mb-6" padding={false}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    {label}
                    <span className="ml-2 text-sm font-normal text-gray-400 tabular-nums">{count}</span>
                </h3>
                <button
                    type="button"
                    onClick={onClear}
                    className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear filter
                </button>
            </div>

            {items.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Nothing to show here.</p>
            ) : (
                <>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[32rem] overflow-y-auto">
                        {type === 'tasks' && items.map((task) => (
                            <TaskRow key={task.id} task={task} canArrangeCover={canArrangeCover} onReassign={onReassign} showStatus />
                        ))}

                        {type === 'projects' && items.map((p) => (
                            <li key={p.id}>
                                <Link href={p.url} className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {p.role === 'owner' ? 'Owner' : 'Member'}{p.due_date ? ` · due ${dueLabel(p.due_date)}` : ''}
                                        </p>
                                    </div>
                                    <Badge status={p.status} />
                                </Link>
                            </li>
                        ))}

                        {type === 'activity' && items.map((a, i) => (
                            <li key={i} className="px-6 py-3">
                                <p className="text-sm text-gray-800 dark:text-gray-200">
                                    <span className="font-medium">{a.action}</span>
                                    {a.entity && <span className="text-gray-500 dark:text-gray-400"> · {a.entity}</span>}
                                </p>
                                {a.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{a.description}</p>}
                                <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(a.created_at)}</p>
                            </li>
                        ))}
                    </ul>
                    {hidden > 0 && (
                        <p className="px-6 py-2.5 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
                            Showing the first {limit} of {count}.
                        </p>
                    )}
                </>
            )}
        </Card>
    );
}

/** Tasks this person owns that are currently sitting with a stand-in. */
function DelegatedAway({ rows, canArrangeCover }) {
    const [ending, setEnding] = useState(null);

    const endNow = (delegationId) => {
        setEnding(delegationId);
        router.post(`/task-delegations/${delegationId}/end`, {}, {
            preserveScroll: true,
            onFinish: () => setEnding(null),
        });
    };

    return (
        <Card className="mb-6" padding={false}>
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    Temporarily reassigned
                    <span className="ml-2 text-sm font-normal text-gray-400 tabular-nums">{rows.length}</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Out with a stand-in for now — these return automatically when the cover ends.
                </p>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.map((row) => (
                    <li key={`${row.delegation_id}-${row.task.id}`} className="flex items-center gap-3 px-6 py-3">
                        <div className="min-w-0 flex-1">
                            <Link href={row.task.url} className="text-sm text-gray-800 dark:text-gray-200 truncate hover:text-primary-600 dark:hover:text-primary-400 block">
                                {row.task.title}
                            </Link>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {row.task.project ? `${row.task.project.name} · ` : ''}
                                with <span className="font-medium">{row.delegate || 'a stand-in'}</span>
                                {row.ends_on ? ` until ${dueLabel(row.ends_on)}` : ''}
                            </p>
                        </div>
                        {canArrangeCover && row.per_task && (
                            <button
                                type="button"
                                disabled={ending === row.delegation_id}
                                onClick={() => endNow(row.delegation_id)}
                                className="shrink-0 text-xs font-medium text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 disabled:opacity-50"
                            >
                                {ending === row.delegation_id ? 'Returning…' : 'End early'}
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </Card>
    );
}

/** Temporarily hand a single task to one stand-in for a date range. */
function ReassignTaskModal({ task, profile, people, errors, onClose }) {
    const [form, setForm] = useState({ delegate_id: '', starts_on: today(), ends_on: '', reason: '' });

    const submit = () => {
        router.post('/task-delegations/task', {
            task_id: task.id,
            delegate_id: form.delegate_id,
            starts_on: form.starts_on,
            ends_on: form.ends_on,
            reason: form.reason || null,
        }, {
            preserveScroll: true,
            onSuccess: onClose,
        });
    };

    const options = people
        .filter((p) => p.id !== profile.id)
        .map((p) => ({ value: p.id, label: p.name }));

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Reassign task temporarily"
            actions={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={submit} disabled={!form.delegate_id || !form.ends_on}>Reassign</Button>
                </>
            }
        >
            <div className="space-y-4 text-left">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</p>
                    {task.project && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{task.project.name}</p>}
                </div>

                <SearchableSelect
                    label="Reassign to"
                    id="delegate_id"
                    value={form.delegate_id}
                    onChange={(v) => setForm({ ...form, delegate_id: v })}
                    placeholder="Choose a stand-in…"
                    options={options}
                    error={errors.delegate_id}
                    showAvatar
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                        label="From" id="starts_on" type="date"
                        value={form.starts_on}
                        onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
                        error={errors.starts_on}
                    />
                    <div>
                        <Input
                            label="Until" id="ends_on" type="date"
                            value={form.ends_on}
                            onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
                            error={errors.ends_on}
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            The last day of cover. The task returns the next morning.
                        </p>
                    </div>
                </div>

                <Input
                    label="Reason (optional)" id="reason"
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="Out on leave"
                    error={errors.reason}
                />
            </div>
        </Modal>
    );
}

/** Whole-person temporary cover: all of this person's open tasks to stand-ins. */
function WholeCoverModal({ profile, people, currentCover, maxDelegates = 2, errors, onClose }) {
    const [form, setForm] = useState({ delegate_ids: [], starts_on: today(), ends_on: '', reason: '' });

    const submit = () => {
        router.post('/task-delegations', {
            user_id: profile.id,
            delegate_ids: form.delegate_ids,
            starts_on: form.starts_on,
            ends_on: form.ends_on,
            reason: form.reason || null,
        }, {
            preserveScroll: true,
            onSuccess: onClose,
        });
    };

    const setDelegate = (index, value) => {
        const next = [...form.delegate_ids];
        if (value) next[index] = Number(value);
        else next.splice(index, 1);
        setForm({ ...form, delegate_ids: next.filter((v) => v != null) });
    };

    const delegateOptions = (index) => people
        .filter((p) => p.id !== profile.id)
        .filter((p) => !form.delegate_ids.some((id, i) => i !== index && id === p.id))
        .map((p) => ({ value: p.id, label: p.name }));

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Reassign all tasks temporarily"
            size="lg"
            actions={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={submit} disabled={form.delegate_ids.length === 0 || !form.ends_on}>Set up cover</Button>
                </>
            }
        >
            <div className="space-y-4 text-left">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    Move all of <span className="font-medium text-gray-900 dark:text-gray-100">{profile.name}</span>’s open
                    tasks to a stand-in for the dates you choose. They return automatically the day after cover ends. With two
                    stand-ins the tasks are split evenly.
                </p>

                {currentCover && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                        Cover is already {currentCover.running ? 'running' : 'scheduled'} for {currentCover.period}
                        {currentCover.delegates.length ? ` with ${currentCover.delegates.join(' & ')}` : ''}. A new one cannot overlap it.
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Array.from({ length: maxDelegates }, (_, i) => (
                        <SearchableSelect
                            key={i}
                            label={i === 0 ? 'Tasks go to' : 'And also (optional)'}
                            id={`delegate_${i}`}
                            value={form.delegate_ids[i] ?? ''}
                            onChange={(v) => setDelegate(i, v)}
                            placeholder={i === 0 ? 'Choose a stand-in…' : 'Split with a second person…'}
                            options={delegateOptions(i)}
                            error={i === 0 ? (errors.delegate_ids || errors['delegate_ids.0']) : errors[`delegate_ids.${i}`]}
                            showAvatar
                        />
                    ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                        label="From" id="starts_on" type="date"
                        value={form.starts_on}
                        onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
                        error={errors.starts_on}
                    />
                    <div>
                        <Input
                            label="Until" id="ends_on" type="date"
                            value={form.ends_on}
                            onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
                            error={errors.ends_on}
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Tasks return the next morning.</p>
                    </div>
                </div>

                <Input
                    label="Reason (optional)" id="reason"
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="Annual leave"
                    error={errors.reason}
                />
            </div>
        </Modal>
    );
}

/** Permanent hand-over: move everything to someone else, for good. */
function HandoverModal({ profile, people, counts, onClose }) {
    const [toId, setToId] = useState('');

    const submit = () => {
        router.post(`/users/${profile.id}/transfer-tasks`, { to_user_id: toId }, {
            preserveScroll: true,
            onSuccess: onClose,
        });
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Hand over work"
            actions={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={submit} disabled={!toId}>Transfer</Button>
                </>
            }
        >
            <div className="space-y-4 text-left">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    Move every unfinished task and every project owned by{' '}
                    <span className="font-medium text-gray-900 dark:text-gray-100">{profile.name}</span> to somebody else,
                    permanently. For when a person has left the organisation.
                </p>

                <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2 text-sm space-y-1">
                    <p className="text-gray-600 dark:text-gray-300">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{counts.open_tasks}</span>{' '}
                        unfinished {counts.open_tasks === 1 ? 'task' : 'tasks'}
                    </p>
                    <p className="text-gray-600 dark:text-gray-300">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">{counts.owned_projects}</span>{' '}
                        {counts.owned_projects === 1 ? 'project' : 'projects'} they own
                    </p>
                </div>

                <SearchableSelect
                    label="Transfer to"
                    id="to_user_id"
                    value={toId}
                    onChange={(v) => setToId(v)}
                    placeholder="Choose a person…"
                    options={people.map((p) => ({ value: p.id, label: p.name }))}
                    showAvatar
                />

                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Completed and cancelled tasks stay where they are, so the record of who did the work is not rewritten.
                    Project ownership moves in full. This cannot be undone in bulk.
                </p>
            </div>
        </Modal>
    );
}

export default function Show() {
    const {
        profile, kpis, recentActivity = [], upcoming, canManage,
        filtered = null, delegatedAway = [], canArrangeCover = false, canHandover = false,
        coverPeople = [], currentCover = null, handover = null, handoverPeople = [],
        canViewUsers = false,
        errors = {},
    } = usePage().props;

    const tier = activityTier(kpis.activity30);

    // "Back" goes to the Users list for anyone who can open it; otherwise to My
    // Personnel, which is how a head or team leader reaches this page.
    const backCrumb = canViewUsers
        ? { label: 'Users', href: '/users' }
        : { label: 'My Personnel', href: '/my-personnel' };

    const [reassignTask, setReassignTask] = useState(null);
    const [showWholeCover, setShowWholeCover] = useState(false);
    const [showHandover, setShowHandover] = useState(false);

    // Which card is lit: the filter query value, normalised from the payload.
    const activeFilter = filtered
        ? (filtered.type === 'tasks' ? filtered.key.replace('tasks:', '') : filtered.key)
        : null;

    const setFilter = (key) => {
        router.get(`/users/${profile.id}`, { filter: key }, {
            preserveState: true, preserveScroll: true, only: ['filtered'],
        });
    };

    const clearFilter = () => {
        router.get(`/users/${profile.id}`, {}, {
            preserveState: true, preserveScroll: true, only: ['filtered'],
        });
    };

    const headerActions = (
        <div className="flex flex-wrap items-center gap-2">
            {canArrangeCover && (
                <button
                    onClick={() => setShowWholeCover(true)}
                    className="px-4 py-2 text-sm font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50"
                >
                    Reassign temporarily
                </button>
            )}
            {canHandover && (
                <button
                    onClick={() => setShowHandover(true)}
                    className="px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                    Hand over work
                </button>
            )}
            {canManage && (
                <Link href={`/users/${profile.id}/edit`} className="px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
                    Edit User
                </Link>
            )}
        </div>
    );

    return (
        <AuthenticatedLayout title={`${profile.name} — Overview`}>
            <PageHeader
                title="User Overview"
                breadcrumbs={[
                    { label: 'Dashboard', href: '/dashboard' },
                    backCrumb,
                    { label: profile.name },
                ]}
                actions={headerActions}
            />

            {/* Identity */}
            <Card className="mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    <Avatar name={profile.name} size="lg" />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{profile.name}</h2>
                            {!profile.is_active && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Inactive</span>
                            )}
                            {currentCover?.running && (
                                <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                    title={`Covered${currentCover.delegates?.length ? ` by ${currentCover.delegates.join(' & ')}` : ''} · ${currentCover.period}`}
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    Away
                                </span>
                            )}
                            {profile.roles?.map((r) => (
                                <span key={r} className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">{r}</span>
                            ))}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{profile.position || '—'} · {profile.email}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {[profile.division, profile.department, profile.team].filter(Boolean).join(' › ') || 'No org unit'}
                        </p>
                    </div>
                    <div className="text-right">
                        <div className={`inline-flex items-center gap-2 text-sm font-medium ${tier.cls}`}>
                            <span className={`w-2 h-2 rounded-full ${tier.dot}`} />
                            {tier.label}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Last active {fmtDate(kpis.lastActivityAt)}</p>
                    </div>
                </div>
            </Card>

            {currentCover && (
                <div className="mb-6 flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
                    <span className={`h-2 w-2 rounded-full ${currentCover.running ? 'bg-amber-500' : 'bg-blue-500'}`} />
                    <span>
                        {currentCover.running ? 'Tasks are being covered' : 'Cover is scheduled'}
                        {currentCover.delegates.length ? ` by ${currentCover.delegates.join(' & ')}` : ''} · {currentCover.period}
                    </span>
                </div>
            )}

            {/* Headline KPIs — click to filter */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Stat label="Productivity" value={`${kpis.productivity}%`} accent={rateColor(kpis.productivity)} tip={PRODUCTIVITY_TIP} onClick={() => setFilter('all')} active={activeFilter === 'all'} />
                <Stat label="Projects Involved" value={kpis.projectsInvolved} onClick={() => setFilter('projects:involved')} active={activeFilter === 'projects:involved'} />
                <Stat label="Tasks Completed" value={kpis.tasksCompleted} accent="text-green-600 dark:text-green-400" onClick={() => setFilter('completed')} active={activeFilter === 'completed'} />
                <Stat label="Overdue Tasks" value={kpis.tasksOverdue} accent={kpis.tasksOverdue > 0 ? 'text-red-600 dark:text-red-400' : ''} onClick={() => setFilter('overdue')} active={activeFilter === 'overdue'} />
            </div>

            {delegatedAway.length > 0 && (
                <DelegatedAway rows={delegatedAway} canArrangeCover={canArrangeCover} />
            )}

            {filtered ? (
                <FilteredPanel
                    filtered={filtered}
                    onClear={clearFilter}
                    canArrangeCover={canArrangeCover}
                    onReassign={setReassignTask}
                />
            ) : (
                <UpcomingTasks upcoming={upcoming} name={profile.name} canArrangeCover={canArrangeCover} onReassign={setReassignTask} />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Performance meters */}
                <Card className="lg:col-span-1">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Performance</h3>
                    <div className="space-y-4">
                        <Meter label="Completion Rate" value={kpis.completionRate} tip="Tasks marked Done ÷ total tasks assigned." onClick={() => setFilter('completed')} active={activeFilter === 'completed'} />
                        <Meter label="On-Time Rate" value={kpis.onTimeRate} tip="Completed tasks finished on or before their due date ÷ completed tasks that had a due date." onClick={() => setFilter('ontime')} active={activeFilter === 'ontime'} />
                        <Meter label="Productivity Score" value={kpis.productivity} tip={PRODUCTIVITY_TIP} onClick={() => setFilter('all')} active={activeFilter === 'all'} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-gray-100 dark:border-gray-700 text-center">
                        <button type="button" onClick={() => setFilter('all')} className={`rounded-lg py-1.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40 ${activeFilter === 'all' ? 'ring-1 ring-primary-300 dark:ring-primary-700' : ''}`}>
                            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{kpis.tasksTotal}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Total Tasks</p>
                        </button>
                        <button type="button" onClick={() => setFilter('active')} className={`rounded-lg py-1.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40 ${activeFilter === 'active' ? 'ring-1 ring-primary-300 dark:ring-primary-700' : ''}`}>
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{kpis.tasksActive}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Active Tasks</p>
                        </button>
                    </div>
                </Card>

                {/* Projects */}
                <Card className="lg:col-span-1">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Projects</h3>
                    <div className="space-y-1">
                        {[
                            { label: 'Owned', value: kpis.projectsOwned, key: 'projects:owned' },
                            { label: 'Member of', value: kpis.projectsMember, key: 'projects:member' },
                            { label: 'Total Involved', value: kpis.projectsInvolved, key: 'projects:involved' },
                        ].map((row) => (
                            <button
                                key={row.label}
                                type="button"
                                onClick={() => setFilter(row.key)}
                                className={`flex w-full items-center justify-between rounded-lg -mx-2 px-2 py-1.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40 ${activeFilter === row.key ? 'bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-300 dark:ring-primary-700' : ''}`}
                            >
                                <span className="text-sm text-gray-600 dark:text-gray-400">{row.label}</span>
                                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{row.value}</span>
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setFilter('activity')}
                        className={`mt-4 pt-4 w-full text-left border-t border-gray-100 dark:border-gray-700 rounded-b-lg transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40 ${activeFilter === 'activity' ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                    >
                        <p className="text-sm text-gray-600 dark:text-gray-400">Actions in last 30 days</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">{kpis.activity30}</p>
                    </button>
                </Card>

                {/* Recent activity */}
                <Card className="lg:col-span-1" padding={false}>
                    <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
                    </div>
                    {recentActivity.length === 0 ? (
                        <p className="px-6 py-8 text-center text-sm text-gray-400 dark:text-gray-500">No recent activity.</p>
                    ) : (
                        <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-80 overflow-y-auto">
                            {recentActivity.map((a, i) => (
                                <li key={i} className="px-6 py-3">
                                    <p className="text-sm text-gray-800 dark:text-gray-200">
                                        <span className="font-medium">{a.action}</span>
                                        {a.entity && <span className="text-gray-500 dark:text-gray-400"> · {a.entity}</span>}
                                    </p>
                                    {a.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{a.description}</p>}
                                    <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(a.created_at)}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>

            {reassignTask && (
                <ReassignTaskModal
                    task={reassignTask}
                    profile={profile}
                    people={coverPeople}
                    errors={errors}
                    onClose={() => setReassignTask(null)}
                />
            )}

            {showWholeCover && (
                <WholeCoverModal
                    profile={profile}
                    people={coverPeople}
                    currentCover={currentCover}
                    errors={errors}
                    onClose={() => setShowWholeCover(false)}
                />
            )}

            {showHandover && handover && (
                <HandoverModal
                    profile={profile}
                    people={handoverPeople}
                    counts={handover}
                    onClose={() => setShowHandover(false)}
                />
            )}
        </AuthenticatedLayout>
    );
}
