import { useForm, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import LinkAssignmentPicker from '../../Components/LinkAssignmentPicker';
import Textarea from '../../Components/Textarea';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';

export default function Edit() {
    const { link, assignments = [], users = [], teams = [], departments = [], divisions = [], roles = [], linkGroups = [] } = usePage().props;

    const { data, setData, put, processing, errors } = useForm({
        title: link.title || '',
        description: link.description || '',
        url: link.url || '',
        user_id: link.user_id || '',
        assignments,
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        put(`/links/${link.id}`);
    };

    return (
        <AuthenticatedLayout title="Edit Link">
            <div className="max-w-2xl">
                <PageHeader
                    title="Edit Link"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Links & URLs', href: '/links' },
                        { label: 'Edit Link' },
                    ]}
                />

                <Card>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Input label="Title" id="title" value={data.title} onChange={(e) => setData('title', e.target.value)} error={errors.title} />
                        <Textarea label="Description" id="description" value={data.description} onChange={(e) => setData('description', e.target.value)} error={errors.description} />
                        <Input label="URL" id="url" type="url" value={data.url} onChange={(e) => setData('url', e.target.value)} error={errors.url} placeholder="https://" />
                        <LinkAssignmentPicker
                            value={data.assignments}
                            onChange={(next) => setData('assignments', next)}
                            error={errors.assignments}
                            users={users} teams={teams} departments={departments}
                            divisions={divisions} roles={roles} linkGroups={linkGroups}
                        />

                        <div className="flex justify-end gap-3 pt-4">
                            <LinkButton href="/links" variant="secondary">Cancel</LinkButton>
                            <Button type="submit" processing={processing} processingText="Saving...">Save Changes</Button>
                        </div>
                    </form>
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
