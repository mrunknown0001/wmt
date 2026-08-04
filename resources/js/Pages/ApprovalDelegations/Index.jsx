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

export default function ApprovalDelegationsIndex() {
    const { delegations = [], people = [], canManageOthers, currentUserId, errors = {} } = usePage().props;

    const [form, setForm] = useState({
        user_id: currentUserId,
        delegate_id: '',
        starts_on: today(),
        ends_on: '',
        reason: '',
    });
    const [confirmRemove, setConfirmRemove] = useState(null);

    const submit = (e) => {
        e.preventDefault();
        router.post('/approval-delegations', {
            ...form,
            ends_on: form.ends_on || null,
            reason: form.reason || null,
        }, {
            preserveScroll: true,
            onSuccess: () => setForm({ ...form, delegate_id: '', ends_on: '', reason: '' }),
        });
    };

    const active = delegations.filter((d) => d.active);
    const other = delegations.filter((d) => !d.active);

    const row = (d) => (
        <li key={d.id} className="flex items-start gap-3 py-3">
            <Avatar name={d.user.name || '?'} size="sm" />
            <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-gray-100">
                    <span className="font-medium">{d.user.name}</span>
                    <span className="text-gray-400"> → </span>
                    <span className="font-medium">{d.delegate.name}</span>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    {d.period}
                    {d.reason ? ` · ${d.reason}` : ''}
                </p>
            </div>
            {d.active && (
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                    Active
                </span>
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
        <AuthenticatedLayout title="Approval Delegation">
            <div className="max-w-3xl">
                <PageHeader
                    title="Approval Delegation"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'My Approvals', href: '/my-approvals' },
                        { label: 'Delegation' },
                    ]}
                />

                <Card>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Set up cover</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4">
                        While the delegation is running, the stand-in can approve anything waiting on
                        that person. The original approver keeps their access — either can act, and
                        nothing is taken away from them.
                    </p>

                    <form onSubmit={submit} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <SearchableSelect
                                label="While this person is away"
                                id="user_id"
                                value={form.user_id}
                                onChange={(v) => setForm({ ...form, user_id: v })}
                                options={canManageOthers
                                    ? people.map((p) => ({ value: p.id, label: p.name }))
                                    : people.filter((p) => p.id === currentUserId).map((p) => ({ value: p.id, label: p.name }))}
                                error={errors.user_id}
                                showAvatar
                            />
                            <SearchableSelect
                                label="Approvals go to"
                                id="delegate_id"
                                value={form.delegate_id}
                                onChange={(v) => setForm({ ...form, delegate_id: v })}
                                placeholder="Choose a stand-in..."
                                options={people
                                    .filter((p) => p.id !== Number(form.user_id))
                                    .map((p) => ({ value: p.id, label: p.name }))}
                                error={errors.delegate_id}
                                showAvatar
                            />
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
                                    Leave blank for open-ended — you can remove it by hand.
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
                            <Button type="submit" disabled={!form.delegate_id}>Add delegation</Button>
                        </div>
                    </form>
                </Card>

                <Card className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        In force now
                    </h3>
                    {active.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                            Nobody is covering for anybody at the moment.
                        </p>
                    ) : (
                        <ul className="divide-y divide-gray-100 dark:divide-gray-700">{active.map(row)}</ul>
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
                isOpen={!!confirmRemove}
                onClose={() => setConfirmRemove(null)}
                onConfirm={() => {
                    router.delete(`/approval-delegations/${confirmRemove.id}`, { preserveScroll: true });
                    setConfirmRemove(null);
                }}
                title="Remove Delegation"
                confirmLabel="Remove"
                message={
                    `Stop ${confirmRemove?.delegate?.name} covering for ${confirmRemove?.user?.name}? ` +
                    'They will be taken off anything still waiting, but any decision they have already made stands.'
                }
            />
        </AuthenticatedLayout>
    );
}
