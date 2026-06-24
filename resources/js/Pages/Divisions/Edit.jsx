import { useForm, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Select from '../../Components/Select';
import Textarea from '../../Components/Textarea';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';

export default function Edit() {
    const { division, users } = usePage().props;

    const { data, setData, put, processing, errors } = useForm({
        name: division.name || '',
        description: division.description || '',
        head_id: division.head_id || '',
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        put(`/divisions/${division.id}`);
    };

    return (
        <AuthenticatedLayout title="Edit Division">
            <div className="max-w-2xl">
                <PageHeader
                    title="Edit Division"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Divisions', href: '/divisions' },
                        { label: 'Edit Division' },
                    ]}
                />

                <Card>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Input label="Name" id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} error={errors.name} />
                        <Textarea label="Description" id="description" value={data.description} onChange={(e) => setData('description', e.target.value)} error={errors.description} />
                        <Select
                            label="Division Head" id="head_id" value={data.head_id}
                            onChange={(e) => setData('head_id', e.target.value || '')}
                            placeholder="— None —"
                            options={users.map((u) => ({ value: u.id, label: u.name }))}
                            error={errors.head_id}
                        />

                        <div className="flex justify-end gap-3 pt-4">
                            <LinkButton href="/divisions" variant="secondary">Cancel</LinkButton>
                            <Button type="submit" processing={processing} processingText="Saving...">Save Changes</Button>
                        </div>
                    </form>
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
