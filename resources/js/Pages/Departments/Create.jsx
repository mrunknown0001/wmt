import { useForm, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Select from '../../Components/Select';
import Textarea from '../../Components/Textarea';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';

export default function Create() {
    const { divisions, users } = usePage().props;

    const { data, setData, post, processing, errors } = useForm({
        name: '',
        description: '',
        division_id: '',
        head_id: '',
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        post('/departments');
    };

    return (
        <AuthenticatedLayout title="Create Department">
            <div className="max-w-2xl">
                <PageHeader
                    title="Create Department"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Departments', href: '/departments' },
                        { label: 'Create Department' },
                    ]}
                />

                <Card>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Input label="Name" id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} error={errors.name} />
                        <Textarea label="Description" id="description" value={data.description} onChange={(e) => setData('description', e.target.value)} error={errors.description} />
                        <Select
                            label="Division" id="division_id" value={data.division_id}
                            onChange={(e) => setData('division_id', e.target.value)}
                            placeholder="— Select Division —"
                            options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                            error={errors.division_id}
                        />
                        <Select
                            label="Department Head" id="head_id" value={data.head_id}
                            onChange={(e) => setData('head_id', e.target.value || '')}
                            placeholder="— None —"
                            options={users.map((u) => ({ value: u.id, label: u.name }))}
                            error={errors.head_id}
                        />

                        <div className="flex justify-end gap-3 pt-4">
                            <LinkButton href="/departments" variant="secondary">Cancel</LinkButton>
                            <Button type="submit" processing={processing} processingText="Creating...">Create Department</Button>
                        </div>
                    </form>
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
