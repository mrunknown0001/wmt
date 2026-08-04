import { useState } from 'react';
import { router, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Button from '../../Components/Button';
import Input from '../../Components/Input';
import SearchableSelect from '../../Components/SearchableSelect';
import Avatar from '../../Components/Avatar';
import { ConfirmModal } from '../../Components/Modal';

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_PILL = {
    active: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    scheduled: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    ended: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

export default function TaskDelegationsIndex() {
    const {
        delegations = [], people = [], canManageOthers, currentUserId,
        maxDelegates = 2, errors = {},
    } = usePage().props;

    const blank = {
        user_id: currentUserId,
        delegate_ids: [],
        starts_on: today(),
        ends_on: '',
        reason: '',
    };

    const [form, setForm] = useState(blank);
    const [confirmEnd, setConfirmEnd] = useState(null);
    const [confirmRemove, setConfirmRemove] = useState(null);

    const submit = (e) => {
        e.preventDefault();
        router.post('/task-delegations', {
            ...form,
            reason: form.reason || null,
        }, {
            preserveScroll: true,
            onSuccess: () => setForm({ ...blank, user_id: form.user_id, starts_on: form.starts_on }),
        });
    };

    // Each slot excludes the person being covered and whoever is in the other
    // slot, so the same name cannot be picked twice.
    const setDelegate = (index, value) => {
        const next = [...form.delegate_ids];
        if (value) next[index] = Number(value);
        else next.splice(index, 1);
        setForm({ ...form, delegate_ids: next.filter((v) => v != null) });
    };

    const delegateOptions = (index) => people
        .filter((p) => p.id !== Number(form.user_id))
        .filter((p) => !form.delegate_ids.some((id, i) => i !== index && id === p.id))
        .map((p) => ({ value: p.id, label: p.name }));

    const running = delegations.filter((d) => d.running);
    const other = delegations.filter((d) => !d.running);

    const row = (d) => (
        <li key={d.id} className="flex items-start gap-3 py-3">
            <Avatar name={d.user.name || '?'} size="sm" />
            <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100">
                    <span className="font-medium">{d.user.name}</span>
                    <span className="text-gray-400"> → </span>
                    <span className="font-medium">
                        {d.delegates.map((u) => u.name).join(' & ') || 'nobody'}
                    </span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    {d.period}
                    {d.reason ? ` · ${d.reason}` : ''}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {d.running
                        ? `${d.covered_count} ${d.covered_count === 1 ? 'task' : 'tasks'} held`
                        : d.status === 'ended'
                            ? `${d.returned_count} ${d.returned_count === 1 ? 'task' : 'tasks'} returned`
                            : 'Nothing handed over yet'}
                </p>
            </div>

            <span className={`shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${STATUS_PILL[d.status] || STATUS_PILL.ended}`}>
                {d.status}
            </span>

            {d.can_manage && d.status !== 'ended' && (
                <button
                    type="button"
                    onClick={() => setConfirmEnd(d)}
                    className="shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                >
                    End now
                </button>
            )}
            {d.can_manage && (
                <button
                    type="button"
                    onClick={() => setConfirmRemove(d)}
                    className="shrink-0 text-xs text-gray-400 hover:text-red-500"
                >
                    Remove
                </button>
            )}
        </li>
    );

    return (
        <AuthenticatedLayout title="Temporary Task Cover">
            <div className="max-w-3xl">
                <PageHeader
                    title="Temporary Task Cover"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'My Tasks', href: '/my-tasks' },
                        { label: 'Cover' },
                    ]}
                />

                <Card>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Hand tasks over</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4">
                        Open tasks move to the stand-in for the dates you choose, and go back to their
                        owner automatically the day after cover ends. With two stand-ins the tasks are
                        split evenly between them. Anything already done or cancelled is left alone.
                    </p>

                    <form onSubmit={submit} className="space-y-4">
                        <SearchableSelect
                            label="While this person is away"
                            id="user_id"
                            value={form.user_id}
                            onChange={(v) => setForm({ ...form, user_id: v, delegate_ids: [] })}
                            options={canManageOthers
                                ? people.map((p) => ({ value: p.id, label: p.name }))
                                : people.filter((p) => p.id === currentUserId).map((p) => ({ value: p.id, label: p.name }))}
                            error={errors.user_id}
                            showAvatar
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {Array.from({ length: maxDelegates }, (_, i) => (
                                <SearchableSelect
                                    key={i}
                                    label={i === 0 ? 'Tasks go to' : 'And also (optional)'}
                                    id={`delegate_${i}`}
                                    value={form.delegate_ids[i] ?? ''}
                                    onChange={(v) => setDelegate(i, v)}
                                    placeholder={i === 0 ? 'Choose a stand-in...' : 'Split with a second person...'}
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
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    The last day of cover. Tasks return the next morning.
                                </p>
                            </div>
                        </div>

                        <Input
                            label="Reason (optional)" id="reason"
                            value={form.reason}
                            onChange={(e) => setForm({ ...form, reason: e.target.value })}
                            placeholder="Annual leave"
                            error={errors.reason}
                        />

                        <div className="flex justify-end">
                            <Button type="submit" disabled={form.delegate_ids.length === 0 || !form.ends_on}>
                                Set up cover
                            </Button>
                        </div>
                    </form>
                </Card>

                <Card className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        Running now
                    </h3>
                    {running.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                            Nobody's tasks are being covered at the moment.
                        </p>
                    ) : (
                        <ul className="divide-y divide-gray-100 dark:divide-gray-700">{running.map(row)}</ul>
                    )}

                    {other.length > 0 && (
                        <>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-2">
                                Scheduled and finished
                            </h3>
                            <ul className="divide-y divide-gray-100 dark:divide-gray-700 opacity-70">
                                {other.map(row)}
                            </ul>
                        </>
                    )}
                </Card>
            </div>

            <ConfirmModal
                isOpen={!!confirmEnd}
                onClose={() => setConfirmEnd(null)}
                onConfirm={() => {
                    router.post(`/task-delegations/${confirmEnd.id}/end`, {}, { preserveScroll: true });
                    setConfirmEnd(null);
                }}
                title="End Cover Now"
                confirmLabel="End cover"
                message={
                    `Return ${confirmEnd?.user?.name}'s tasks to them now? ` +
                    'Anything a stand-in has since finished, or that somebody reassigned by hand, stays where it is.'
                }
            />

            <ConfirmModal
                isOpen={!!confirmRemove}
                onClose={() => setConfirmRemove(null)}
                onConfirm={() => {
                    router.delete(`/task-delegations/${confirmRemove.id}`, { preserveScroll: true });
                    setConfirmRemove(null);
                }}
                title="Remove Cover"
                confirmLabel="Remove"
                message={
                    `Delete this cover arrangement for ${confirmRemove?.user?.name}? ` +
                    'Any tasks still held by a stand-in are returned first, so nothing is left stranded.'
                }
            />
        </AuthenticatedLayout>
    );
}
