import { router, usePage } from '@inertiajs/react';
import { useState } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';
import Pagination from '../../Components/Pagination';
import { ConfirmModal } from '../../Components/Modal';

const emptyForm = { id: null, name: '', description: '', member_ids: [] };

export default function Index() {
    const { groups, users = [] } = usePage().props;
    const [form, setForm] = useState(emptyForm);
    const [showForm, setShowForm] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [memberQuery, setMemberQuery] = useState('');

    const startCreate = () => { setForm(emptyForm); setMemberQuery(''); setShowForm(true); };

    const startEdit = (group) => {
        setForm({
            id: group.id,
            name: group.name,
            description: group.description || '',
            member_ids: (group.members || []).map((m) => m.id),
        });
        setMemberQuery('');
        setShowForm(true);
    };

    const toggleMember = (userId) => setForm((f) => ({
        ...f,
        member_ids: f.member_ids.includes(userId)
            ? f.member_ids.filter((id) => id !== userId)
            : [...f.member_ids, userId],
    }));

    const submit = (e) => {
        e.preventDefault();
        const payload = { name: form.name, description: form.description, member_ids: form.member_ids };
        const done = { preserveScroll: true, onSuccess: () => { setShowForm(false); setForm(emptyForm); } };
        form.id
            ? router.put(`/links/groups/${form.id}`, payload, done)
            : router.post('/links/groups', payload, done);
    };

    const visibleUsers = users.filter((u) =>
        !memberQuery || u.name.toLowerCase().includes(memberQuery.toLowerCase())
    );

    return (
        <AuthenticatedLayout title="Link Groups">
            <div>
                <PageHeader
                    title="Link Groups"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Links & URLs', href: '/links' },
                        { label: 'Groups' },
                    ]}
                    actions={
                        <div className="flex gap-2">
                            <LinkButton href="/links" variant="secondary">Back to Links</LinkButton>
                            <Button onClick={startCreate}>New Group</Button>
                        </div>
                    }
                />

                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Reusable sets of people for audiences that don’t match the org chart. Assign a
                    group to a link and everyone in it gets access.
                </p>

                {showForm && (
                    <Card className="mb-4">
                        <form onSubmit={submit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Name</label>
                                    <input
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        placeholder="e.g. Night Shift"
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Description</label>
                                    <input
                                        value={form.description}
                                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                                    Members ({form.member_ids.length})
                                </label>
                                <input
                                    value={memberQuery}
                                    onChange={(e) => setMemberQuery(e.target.value)}
                                    placeholder="Search people..."
                                    className="w-full px-3 py-2 mb-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                />
                                <div className="max-h-52 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                                    {visibleUsers.map((u) => (
                                        <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <input
                                                type="checkbox"
                                                checked={form.member_ids.includes(u.id)}
                                                onChange={() => toggleMember(u.id)}
                                                className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                            />
                                            <span className="text-gray-900 dark:text-gray-100">{u.name}</span>
                                        </label>
                                    ))}
                                    {visibleUsers.length === 0 && (
                                        <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No matching people.</p>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                                <Button type="submit" disabled={!form.name.trim()}>
                                    {form.id ? 'Save Group' : 'Create Group'}
                                </Button>
                            </div>
                        </form>
                    </Card>
                )}

                <Card padding={false}>
                    {groups.data.length === 0 ? (
                        <p className="p-8 text-center text-gray-500 dark:text-gray-400">
                            No groups yet. Create one to assign links to a set of people at once.
                        </p>
                    ) : (
                        <>
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Group</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Members</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {groups.data.map((group) => (
                                        <tr key={group.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-6 py-4">
                                                <p className="font-medium text-gray-900 dark:text-white">{group.name}</p>
                                                {group.description && (
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">{group.description}</p>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                                {group.members_count} member{group.members_count === 1 ? '' : 's'}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm">
                                                <button onClick={() => startEdit(group)} className="text-blue-600 dark:text-blue-400 hover:underline mr-4">Edit</button>
                                                <button onClick={() => setDeleteTarget(group)} className="text-red-600 dark:text-red-400 hover:underline">Delete</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <Pagination links={groups.links} />
                        </>
                    )}
                </Card>
            </div>

            <ConfirmModal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={() => {
                    router.delete(`/links/groups/${deleteTarget.id}`, { preserveScroll: true });
                    setDeleteTarget(null);
                }}
                title="Delete group"
                message={`Delete "${deleteTarget?.name}"? Links assigned to this group will lose that audience.`}
                confirmLabel="Delete"
                variant="danger"
            />
        </AuthenticatedLayout>
    );
}
