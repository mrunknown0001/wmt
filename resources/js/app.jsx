import { createInertiaApp, router } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './ThemeContext';
import './echo';

// Register Firebase service worker for push notifications
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/firebase-messaging-sw.js').catch((err) => {
        console.warn('Firebase SW registration failed', err);
    });
}

// Smooth page transition
router.on('start', () => {
    document.getElementById('app')?.style.setProperty('opacity', '0.92');
});
router.on('finish', () => {
    document.getElementById('app')?.style.setProperty('opacity', '1');
});

createInertiaApp({
    title: (title) => title ? `${title} - WMT` : 'WMT',
    resolve: (name) => {
        const pages = import.meta.glob('./Pages/**/*.jsx', { eager: true });
        return pages[`./Pages/${name}.jsx`];
    },
    setup({ el, App, props }) {
        createRoot(el).render(
            <ThemeProvider>
                <App {...props} />
            </ThemeProvider>
        );
    },
});
