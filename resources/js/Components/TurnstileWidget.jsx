import { useEffect, useRef, useCallback } from 'react';

export default function TurnstileWidget({ siteKey, onVerify, onExpire, error }) {
    const containerRef = useRef(null);
    const widgetIdRef = useRef(null);

    const renderWidget = useCallback(() => {
        if (!siteKey || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current !== null) {
            window.turnstile.reset(widgetIdRef.current);
            return;
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            callback: (token) => onVerify?.(token),
            'expired-callback': () => onExpire?.(),
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        });
    }, [siteKey, onVerify, onExpire]);

    useEffect(() => {
        if (!siteKey) return;

        if (window.turnstile) {
            renderWidget();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit';
        script.async = true;
        window.onTurnstileLoad = renderWidget;
        document.head.appendChild(script);

        return () => {
            delete window.onTurnstileLoad;
        };
    }, [renderWidget, siteKey]);

    if (!siteKey) return null;

    return (
        <div>
            <div ref={containerRef} className="flex justify-center" />
            {error && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
            )}
        </div>
    );
}
