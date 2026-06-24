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
    const { team, departments, users } = usePage().props;

    const { data, setData, put, processing, errors } = useForm({
        name: team.name || '',
        description: team.description || '',
        department_id: team.department_id || '',
        leader_id: team.leader_id || '',
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        put(`/teams/${team.id}`);
    };

    return (
        <AuthenticatedLayout title="Edit Team">
            <div className="max-w-2xl">
                <PageHeader
                    title="Edit Team"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Teams', href: '/teams' },
                        { label: 'Edit Team' },
                    ]}
                />

                <Card>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Input label="Name" id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} error={errors.name} />
                        <Textarea label="Description" id="description" value={data.description} onChange={(e) => setData('description', e.target.value)} error={errors.description} />
                        <div>
                            <label htmlFor="department_id" className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Department</label>
                            <select
                                id="department_id"
                                value={data.department_id}
                                onChange={(e) => setData('department_id', e.target.value)}
                                className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm transition-colors dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            >
                                <option value="">— Select Department —</option>
                                {departments.map((dept) => (
                                    <option key={dept.id} value={dept.id}>{dept.name} ({dept.division?.name})</option>
                                ))}
                            </select>
                            {errors.department_id && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.department_id}</p>}
                        </div>
                        <Select
                            label="Team Leader" id="leader_id" value={data.leader_id}
                            onChange={(e) => setData('leader_id', e.target.value || '')}
                            placeholder="— None —"
                            options={users.map((u) => ({ value: u.id, label: u.name }))}
                            error={errors.leader_id}
                        />

                        <div className="flex justify-end gap-3 pt-4">
                            <LinkButton href="/teams" variant="secondary">Cancel</LinkButton>
                            <Button type="submit" processing={processing} processingText="Saving...">Save Changes</Button>
                        </div>
                    </form>
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
