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

export default function Create() {
    const { project, users, statuses, priorities } = usePage().props;

    const { data, setData, post, processing, errors } = useForm({
        title: '',
        description: '',
        status: 'to_do',
        priority: 'medium',
        assigned_to: '',
        due_date: '',
        collaborator_ids: [],
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        post(`/projects/${project.id}/tasks`);
    };

    return (
        <AuthenticatedLayout title="New Task">
            <div className="max-w-2xl">
                <PageHeader
                    title="New Task"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Projects', href: '/projects' },
                        { label: project.name, href: `/projects/${project.id}` },
                        { label: 'New Task' },
                    ]}
                />

                <Card>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Input label="Title" id="title" value={data.title} onChange={(e) => setData('title', e.target.value)} error={errors.title} />
                        <Textarea label="Description" id="description" value={data.description} onChange={(e) => setData('description', e.target.value)} error={errors.description} />

                        <div className="grid grid-cols-2 gap-4">
                            <Select label="Status" id="status" value={data.status} onChange={(e) => setData('status', e.target.value)} options={statuses.map((s) => ({ value: s, label: formatLabel(s) }))} error={errors.status} />
                            <Select label="Priority" id="priority" value={data.priority} onChange={(e) => setData('priority', e.target.value)} options={priorities.map((p) => ({ value: p, label: formatLabel(p) }))} error={errors.priority} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Select label="Assigned To" id="assigned_to" value={data.assigned_to} onChange={(e) => setData('assigned_to', e.target.value || '')} placeholder="— Unassigned —" options={users.map((u) => ({ value: u.id, label: u.name }))} error={errors.assigned_to} />
                            <Input label="Due Date" id="due_date" type="date" value={data.due_date} onChange={(e) => setData('due_date', e.target.value)} error={errors.due_date} />
                        </div>

                        <UserMultiSelect
                            label="Collaborators"
                            users={users}
                            selected={data.collaborator_ids}
                            onChange={(ids) => setData('collaborator_ids', ids)}
                            excludeIds={data.assigned_to ? [Number(data.assigned_to)] : []}
                        />

                        <div className="flex justify-end gap-3 pt-4">
                            <LinkButton href={`/projects/${project.id}`} variant="secondary">Cancel</LinkButton>
                            <Button type="submit" processing={processing} processingText="Creating...">Create Task</Button>
                        </div>
                    </form>
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
