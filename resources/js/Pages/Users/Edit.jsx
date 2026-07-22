import { useForm, usePage } from '@inertiajs/react';
import { useMemo } from 'react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Select from '../../Components/Select';
import Checkbox from '../../Components/Checkbox';
import Button from '../../Components/Button';
import LinkButton from '../../Components/LinkButton';
import { formatLabel } from '../../utils';

export default function Edit() {
    const { user, roles, currentRole, departments, teams } = usePage().props;

    const { data, setData, put, processing, errors } = useForm({
        name: user.name || '',
        email: user.email || '',
        password: '',
        password_confirmation: '',
        department_id: user.department_id || '',
        team_id: user.team_id || '',
        position: user.position || '',
        is_active: user.is_active ?? true,
        can_create_rules: user.can_create_rules ?? false,
        can_approve: user.can_approve ?? false,
        can_request: user.can_request ?? false,
        role: currentRole || 'user',
    });

    const filteredTeams = useMemo(() => {
        if (!data.department_id) return [];
        return teams.filter((t) => t.department_id === Number(data.department_id));
    }, [data.department_id, teams]);

    const handleDepartmentChange = (value) => {
        setData((prev) => ({ ...prev, department_id: value, team_id: '' }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        put(`/users/${user.id}`);
    };

    return (
        <AuthenticatedLayout title="Edit User">
            <div className="max-w-2xl">
                <PageHeader
                    title="Edit User"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Users', href: '/users' },
                        { label: 'Edit User' },
                    ]}
                />

                <Card>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Input label="Name" id="name" value={data.name} onChange={(e) => setData('name', e.target.value)} error={errors.name} />
                        <Input label="Email" id="email" type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} error={errors.email} />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input label="Password (leave blank to keep)" id="password" type="password" value={data.password} onChange={(e) => setData('password', e.target.value)} error={errors.password} />
                            <Input label="Confirm Password" id="password_confirmation" type="password" value={data.password_confirmation} onChange={(e) => setData('password_confirmation', e.target.value)} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="department_id" className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Department</label>
                                <select
                                    id="department_id"
                                    value={data.department_id}
                                    onChange={(e) => handleDepartmentChange(e.target.value)}
                                    className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm transition-colors dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                >
                                    <option value="">— None —</option>
                                    {departments.map((dept) => (
                                        <option key={dept.id} value={dept.id}>{dept.name} ({dept.division?.name})</option>
                                    ))}
                                </select>
                                {errors.department_id && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.department_id}</p>}
                            </div>
                            <Select
                                label="Team" id="team_id" value={data.team_id}
                                onChange={(e) => setData('team_id', e.target.value || '')}
                                disabled={!data.department_id}
                                placeholder="— None —"
                                options={filteredTeams.map((t) => ({ value: t.id, label: t.name }))}
                                error={errors.team_id}
                            />
                        </div>

                        <Input label="Position" id="position" value={data.position} onChange={(e) => setData('position', e.target.value)} error={errors.position} />

                        <Select
                            label="Role" id="role" value={data.role}
                            onChange={(e) => setData('role', e.target.value)}
                            options={roles.map((r) => ({ value: r, label: formatLabel(r) }))}
                            error={errors.role}
                        />

                        <Checkbox label="Active" id="is_active" checked={data.is_active} onChange={(e) => setData('is_active', e.target.checked)} />
                        <Checkbox label="Can Create Automation Rules" id="can_create_rules" checked={data.can_create_rules} onChange={(e) => setData('can_create_rules', e.target.checked)} />
                        <Checkbox label="Can Approve Requests" id="can_approve" checked={data.can_approve} onChange={(e) => setData('can_approve', e.target.checked)} />
                        <Checkbox label="Can Request" id="can_request" checked={data.can_request} onChange={(e) => setData('can_request', e.target.checked)} />

                        <div className="flex justify-end gap-3 pt-4">
                            <LinkButton href="/users" variant="secondary">Cancel</LinkButton>
                            <Button type="submit" processing={processing} processingText="Saving...">Save Changes</Button>
                        </div>
                    </form>
                </Card>
            </div>
        </AuthenticatedLayout>
    );
}
