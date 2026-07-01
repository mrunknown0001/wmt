import { useForm } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Input from '../../Components/Input';
import Button from '../../Components/Button';

export default function Password() {
    const { data, setData, put, processing, errors, reset } = useForm({
        current_password: '',
        password: '',
        password_confirmation: '',
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        put('/settings/password', {
            onSuccess: () => reset(),
        });
    };

    return (
        <AuthenticatedLayout title="Change Password">
            <div className="max-w-2xl">
                <PageHeader
                    title="Change Password"
                    breadcrumbs={[
                        { label: 'Dashboard', href: '/dashboard' },
                        { label: 'Change Password' },
                    ]}
                />

                <form onSubmit={handleSubmit}>
                    <Card>
                        <div className="p-6 space-y-4">
                            <Input
                                label="Current Password"
                                id="current_password"
                                type="password"
                                value={data.current_password}
                                onChange={(e) => setData('current_password', e.target.value)}
                                error={errors.current_password}
                            />

                            <Input
                                label="New Password"
                                id="password"
                                type="password"
                                value={data.password}
                                onChange={(e) => setData('password', e.target.value)}
                                error={errors.password}
                            />

                            <Input
                                label="Confirm New Password"
                                id="password_confirmation"
                                type="password"
                                value={data.password_confirmation}
                                onChange={(e) => setData('password_confirmation', e.target.value)}
                                error={errors.password_confirmation}
                            />
                        </div>

                        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex justify-end rounded-b-xl">
                            <Button type="submit" processing={processing} processingText="Updating...">
                                Update Password
                            </Button>
                        </div>
                    </Card>
                </form>
            </div>
        </AuthenticatedLayout>
    );
}
