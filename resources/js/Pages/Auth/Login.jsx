import { useForm } from '@inertiajs/react';
import GuestLayout from '../../Layouts/GuestLayout';
import Input from '../../Components/Input';
import Checkbox from '../../Components/Checkbox';
import Button from '../../Components/Button';

export default function Login() {
    const { data, setData, post, processing, errors } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        post('/login');
    };

    return (
        <GuestLayout title="Login">
            <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                    label="Email" id="email" type="email"
                    value={data.email} onChange={(e) => setData('email', e.target.value)}
                    error={errors.email} autoFocus
                />
                <Input
                    label="Password" id="password" type="password"
                    value={data.password} onChange={(e) => setData('password', e.target.value)}
                    error={errors.password}
                />
                <Checkbox
                    label="Remember me" id="remember"
                    checked={data.remember} onChange={(e) => setData('remember', e.target.checked)}
                />
                <Button type="submit" processing={processing} processingText="Signing in..." className="w-full">
                    Sign in
                </Button>
            </form>
        </GuestLayout>
    );
}
