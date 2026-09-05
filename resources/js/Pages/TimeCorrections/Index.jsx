import { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import EmptyState from '../../Components/EmptyState';
import Pagination from '../../Components/Pagination';
import { apiFetch, errorMessageFrom, formatDate, timeAgo, toast } from '../../utils';

const STATUSES = [
    { value: 'pending', label: 'Waiting' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Turned down' },
    { value: 'all', label: 'All' },
];

const statusChip = (status) => ({
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    approved: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
}[status] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200');

const statusWord = { pending: 'Waiting', approved: 'Approved', rejected: 'Turned down' };

/**
 * Time corrections: the ones waiting on you, and the ones you asked for.
 *
 * Decisions are made from here as well as on the task, because a queue you have
 * to leave to act on is a queue nobody works. The note is optional and worth
 * writing on a refusal: it is the only thing the requester gets back.
 */
export default function TimeCorrectionsIndex({ amendments, projects = [], filters = {}, canDecideAny = false, counts = {} }) {
    // Which row's decision box is open, and what has been typed into it.
    const [deciding, setDeciding] = useState(null);   // { id, note }
    const [busy, setBusy] = useState(false);

    const go = (params) => router.get('/time-corrections', {
        tab: filters.tab,
        status: filters.status,
        project: filters.project || undefined,
        ...params,
    }, { preserveState: true, preserveScroll: true });

    const decide = async (id, verdict, note) => {
        setBusy(true);
        try {
            const res = await apiFetch(`/api/time-log-amendments/${id}/${verdict}`, {
                method: 'POST',
                body: JSON.stringify({ note: note || null }),
            });
            if (!res.ok) throw new Error(await errorMessageFrom(res, 'Could not record that decision.'));

            setDeciding(null);
            toast(verdict === 'approve' ? 'Correction approved.' : 'Correction turned down.', 'success');
            // Reloading rather than splicing the row out: the counts, the badge
            // and the filter all move with it.
            router.reload({ preserveScroll: true });
        } catch (err) {
            toast(err.message || 'Could not record that decision.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const rows = amendments?.data || [];
    const mine = filters.tab === 'mine';

    return (
        <AuthenticatedLayout title="Time corrections">
            <Head title="Time corrections" />

            <div className="py-6">
                <PageHeader
                    title="Time corrections"
                    description={mine
                        ? 'Changes you have asked for on your recorded time, and where they got to.'
                        : 'Requests to change recorded time on projects you run — corrections to what the clock worked out, and entries for days it never saw. Approving writes the figure; turning one down leaves the record exactly as it was.'}
                    breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Time corrections' }]}
                />

                <Card className="mb-6">
                    {/* Two lists, two jobs: a queue to work, and a status check
                        on your own requests. Somebody who runs no project has
                        only the second, so the switch is not shown to them. */}
                    {canDecideAny && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {[
                                { key: 'to_decide', label: 'To decide', count: counts.to_decide },
                                { key: 'mine', label: 'My requests', count: counts.mine },
                            ].map((t) => (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => go({ tab: t.key, page: undefined })}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                        filters.tab === t.key
                                            ? 'bg-primary-600 text-white'
                                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {t.label}
                                    {t.count > 0 && (
                                        <span className={`ml-1.5 text-xs ${filters.tab === t.key ? 'text-white/80' : 'text-amber-600 dark:text-amber-400'}`}>
                                            {t.count}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
                            <div className="flex gap-1">
                                {STATUSES.map((s) => (
                                    <button
                                        key={s.value}
                                        type="button"
                                        onClick={() => go({ status: s.value, page: undefined })}
                                        className={`px-2.5 py-1.5 text-sm rounded-lg border transition-colors ${
                                            filters.status === s.value
                                                ? 'border-primary-500 text-primary-600 bg-primary-50 dark:bg-primary-900/30 dark:text-primary-300'
                                                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                        }`}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {projects.length > 1 && (
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Project</label>
                                <select
                                    value={filters.project || ''}
                                    onChange={(e) => go({ project: e.target.value || undefined, page: undefined })}
                                    className="rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 px-2 py-1.5 text-sm"
                                >
                                    <option value="">All projects</option>
                                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                        )}

                        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                            {amendments?.total || 0} {amendments?.total === 1 ? 'correction' : 'corrections'}
                        </span>
                    </div>
                </Card>

                <Card className="p-0 overflow-hidden">
                    {rows.length === 0 ? (
                        <EmptyState
                            illustration="tasks"
                            title={filters.status === 'pending'
                                ? (mine ? 'Nothing of yours is waiting' : 'Nothing waiting on you')
                                : 'No corrections to show'}
                            description={mine
                                ? 'Corrections you ask for from a task’s Time panel appear here until they are decided.'
                                : 'Requests to change recorded time on your projects land here.'}
                        />
                    ) : (
                        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                            {rows.map((a) => (
                                <li key={a.id} className="px-5 py-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                {/* The change itself, first and biggest: it is what
                                                    the decision is about. An addition has nothing to
                                                    strike through — there was no entry. */}
                                                {a.kind === 'add' ? (
                                                    <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                                        <span className="font-normal text-gray-500 dark:text-gray-400">New entry </span>
                                                        {a.requested_duration}
                                                    </span>
                                                ) : (
                                                    <>
                                                        <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400 line-through">
                                                            {a.original_duration}
                                                        </span>
                                                        <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                                        </svg>
                                                        <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                                            {a.requested_duration}
                                                        </span>
                                                    </>
                                                )}
                                                <span className="text-xs text-gray-400">on {a.logged_on ? formatDate(a.logged_on) : '—'}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusChip(a.status)}`}>
                                                    {statusWord[a.status] || a.status}
                                                </span>
                                            </div>

                                            <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                                                {a.task_id ? (
                                                    <Link
                                                        href={a.project_id
                                                            ? `/projects/${a.project_id}/tasks/${a.task_id}/edit`
                                                            : `/tasks/${a.task_id}/edit`}
                                                        className="font-medium hover:text-primary-600 dark:hover:text-primary-400"
                                                    >
                                                        {a.task_title}
                                                    </Link>
                                                ) : <span className="text-gray-400">Entry deleted</span>}
                                                {a.project_name && <span className="text-gray-400"> · {a.project_name}</span>}
                                            </p>

                                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                {a.requester || 'Someone'} asked {a.requested_at ? timeAgo(a.requested_at) : ''} — {a.reason}
                                            </p>

                                            {/* What became of it, for anything already decided. */}
                                            {a.status !== 'pending' && (
                                                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                                                    {statusWord[a.status]} by {a.reviewer || 'someone'}
                                                    {a.reviewed_at ? ` ${timeAgo(a.reviewed_at)}` : ''}
                                                    {a.review_note ? ` — ${a.review_note}` : ''}
                                                    {a.status === 'rejected' && a.kind !== 'add' && ` · entry still reads ${a.current_duration}`}
                                                </p>
                                            )}
                                        </div>

                                        {a.status === 'pending' && !mine && (
                                            <div className="flex gap-2 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setDeciding({ id: a.id, note: '' })}
                                                    className="px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                                >
                                                    Decide
                                                </button>
                                            </div>
                                        )}

                                        {a.status === 'pending' && mine && (
                                            <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
                                                Waiting on the project owner
                                            </span>
                                        )}
                                    </div>

                                    {/* The decision, with room for a word about why —
                                        which is all the requester gets back. */}
                                    {deciding?.id === a.id && (
                                        <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                                            <input
                                                type="text"
                                                value={deciding.note}
                                                onChange={(e) => setDeciding({ ...deciding, note: e.target.value })}
                                                placeholder="Note (optional) — the requester sees this"
                                                maxLength={500}
                                                autoFocus
                                                className="w-full text-xs rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 py-1.5 px-2"
                                            />
                                            <div className="mt-2 flex gap-2">
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => decide(a.id, 'approve', deciding.note)}
                                                    className="px-2.5 py-1 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                                                >
                                                    {a.kind === 'add' ? `Approve — add ${a.requested_duration}` : `Approve — make it ${a.requested_duration}`}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => decide(a.id, 'reject', deciding.note)}
                                                    className="px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-50"
                                                >
                                                    Turn down
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDeciding(null)}
                                                    className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}

                    <Pagination links={amendments?.links} />
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
