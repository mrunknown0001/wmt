import { useForm, usePage } from '@inertiajs/react';
import { useEffect, useRef, useCallback } from 'react';
import GuestLayout from '../../Layouts/GuestLayout';
import Input from '../../Components/Input';
import Checkbox from '../../Components/Checkbox';
import Button from '../../Components/Button';

export default function Login() {
    const { turnstileSiteKey } = usePage().props;
    const { data, setData, post, processing, errors } = useForm({
        email: '',
        password: '',
        remember: false,
        'cf-turnstile-response': '',
    });

    const turnstileRef = useRef(null);
    const widgetIdRef = useRef(null);

    const renderTurnstile = useCallback(() => {
        if (!turnstileSiteKey || !turnstileRef.current || !window.turnstile) return;
        if (widgetIdRef.current !== null) {
            window.turnstile.reset(widgetIdRef.current);
            return;
        }
        widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
            sitekey: turnstileSiteKey,
            callback: (token) => setData('cf-turnstile-response', token),
            'expired-callback': () => setData('cf-turnstile-response', ''),
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        });
    }, [turnstileSiteKey]);

    useEffect(() => {
        if (!turnstileSiteKey) return;

        if (window.turnstile) {
            renderTurnstile();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
        script.async = true;
        window.onTurnstileLoad = renderTurnstile;
        document.head.appendChild(script);

        return () => {
            delete window.onTurnstileLoad;
        };
    }, [renderTurnstile]);

    const handleSubmit = (e) => {
        e.preventDefault();
        post('/login', {
            onError: () => {
                if (window.turnstile && widgetIdRef.current !== null) {
                    window.turnstile.reset(widgetIdRef.current);
                    setData('cf-turnstile-response', '');
                }
            },
        });
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
                {turnstileSiteKey && (
                    <div>
                        <div ref={turnstileRef} className="flex justify-center" />
                        {errors['cf-turnstile-response'] && (
                            <p className="mt-1 text-sm text-red-600 dark:text-red-400 text-center">
                                {errors['cf-turnstile-response']}
                            </p>
                        )}
                    </div>
                )}
                <Button type="submit" processing={processing} processingText="Signing in..." className="w-full">
                    Sign in
                </Button>
            </form>
        </GuestLayout>
    );
}
