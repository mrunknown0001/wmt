import { useForm } from '@inertiajs/react';
import { useState } from 'react';
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

    const logoutForm = useForm({ password: '' });
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        put('/settings/password', {
            onSuccess: () => reset(),
        });
    };

    const handleLogoutOtherDevices = (e) => {
        e.preventDefault();
        logoutForm.post('/settings/logout-other-devices', {
            onSuccess: () => {
                logoutForm.reset();
                setShowLogoutConfirm(false);
            },
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

                <div className="space-y-6">
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

                    <Card>
                        <div className="p-6">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Logout Other Devices</h3>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Log out of all other browser sessions and mobile devices. Your current session will not be affected.
                            </p>

                            {!showLogoutConfirm ? (
                                <div className="mt-4">
                                    <Button variant="danger" onClick={() => setShowLogoutConfirm(true)}>
                                        Logout Other Devices
                                    </Button>
                                </div>
                            ) : (
                                <form onSubmit={handleLogoutOtherDevices} className="mt-4 space-y-4">
                                    <Input
                                        label="Confirm your password"
                                        id="logout_password"
                                        type="password"
                                        value={logoutForm.data.password}
                                        onChange={(e) => logoutForm.setData('password', e.target.value)}
                                        error={logoutForm.errors.password}
                                    />
                                    <div className="flex items-center gap-3">
                                        <Button type="submit" variant="danger" processing={logoutForm.processing} processingText="Logging out...">
                                            Confirm
                                        </Button>
                                        <Button variant="ghost" onClick={() => { setShowLogoutConfirm(false); logoutForm.reset(); logoutForm.clearErrors(); }}>
                                            Cancel
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
