import { useForm, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Select from '../../Components/Select';
import Textarea from '../../Components/Textarea';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';
import UserMultiSelect from '../../Components/UserMultiSelect';
import { formatLabel } from '../../utils';

export default function Edit() {
    const { project, users, statuses, memberRoles } = usePage().props;

    const { data, setData, put, processing, errors } = useForm({
        name: project.name || '',
        description: project.description || '',
        status: project.status || 'active',
        owner_id: project.owner_id || '',
        due_date: project.due_date ? project.due_date.split('T')[0] : '',
        members: (project.members || []).map((m) => ({ user_id: m.id, role: m.pivot.role })),
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        put(`/projects/${project.id}`);
    };

    return (
        <AuthenticatedLayout title="Edit Project">
            <div className="max-w-2xl">
                <PageHeader
                    title="Edit Project"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Projects', href: '/projects' },
                        { label: project.name, href: `/projects/${project.id}` },
                        { label: 'Edit' },
                    ]}
                />

                <Card>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Input label="Name" id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} error={errors.name} />
                        <Textarea label="Description" id="description" value={data.description} onChange={(e) => setData('description', e.target.value)} error={errors.description} />

                        <div className="grid grid-cols-2 gap-4">
                            <Select
                                label="Status" id="status" value={data.status}
                                onChange={(e) => setData('status', e.target.value)}
                                options={statuses.map((s) => ({ value: s, label: formatLabel(s) }))}
                                error={errors.status}
                            />
                            <Select
                                label="Owner" id="owner_id" value={data.owner_id}
                                onChange={(e) => setData('owner_id', e.target.value)}
                                placeholder="— Unassigned —"
                                options={users.map((u) => ({ value: u.id, label: u.name }))}
                                error={errors.owner_id}
                            />
                        </div>

                        <Input label="Due Date" id="due_date" type="date" value={data.due_date} onChange={(e) => setData('due_date', e.target.value)} error={errors.due_date} />

                        <UserMultiSelect
                            label="Members"
                            users={users}
                            selected={data.members}
                            onChange={(members) => setData('members', members)}
                            excludeIds={data.owner_id ? [Number(data.owner_id)] : []}
                            roles={memberRoles}
                            onRoleChange={(userId, role) => {
                                setData('members', data.members.map((m) =>
                                    m.user_id === userId ? { ...m, role } : m
                                ));
                            }}
                        />

                        <div className="flex justify-end gap-3 pt-4">
                            <LinkButton href={`/projects/${project.id}`} variant="secondary">Cancel</LinkButton>
                            <Button type="submit" processing={processing} processingText="Saving...">Save Changes</Button>
                        </div>
                    </form>
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
