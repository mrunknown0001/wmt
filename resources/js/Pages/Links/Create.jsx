import { useForm, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import LinkAssignmentPicker from '../../Components/LinkAssignmentPicker';
import Textarea from '../../Components/Textarea';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';

export default function Create() {
    const { users = [], teams = [], departments = [], divisions = [], roles = [], linkGroups = [] } = usePage().props;

    const { data, setData, post, processing, errors } = useForm({
        title: '',
        description: '',
        url: '',
        user_id: '',
        assignments: [],
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        post('/links');
    };

    return (
        <AuthenticatedLayout title="Create Link">
            <div className="max-w-2xl">
                <PageHeader
                    title="Create Link"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Links & URLs', href: '/links' },
                        { label: 'Create Link' },
                    ]}
                />

                <Card>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Input label="Title" id="title" value={data.title} onChange={(e) => setData('title', e.target.value)} error={errors.title} />
                        <Textarea label="Description" id="description" value={data.description} onChange={(e) => setData('description', e.target.value)} error={errors.description} />
                        <Input label="URL" id="url" type="url" value={data.url} onChange={(e) => setData('url', e.target.value)} error={errors.url} placeholder="https://" />
                        <LinkAssignmentPicker
                            value={data.assignments}
                            onChange={(assignments) => setData('assignments', assignments)}
                            error={errors.assignments}
                            users={users} teams={teams} departments={departments}
                            divisions={divisions} roles={roles} linkGroups={linkGroups}
                        />

                        <div className="flex justify-end gap-3 pt-4">
                            <LinkButton href="/links" variant="secondary">Cancel</LinkButton>
                            <Button type="submit" processing={processing} processingText="Creating...">Create Link</Button>
                        </div>
                    </form>
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
