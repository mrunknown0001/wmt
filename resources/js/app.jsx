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

// Page navigation progress bar
let progressBar = null;
let progressTimeout = null;

function createProgressBar() {
    const bar = document.createElement('div');
    bar.id = 'nav-progress';
    bar.style.cssText = 'position:fixed;top:0;left:0;height:2px;z-index:9999;pointer-events:none;transition:width 300ms ease;';
    bar.style.width = '0%';
    bar.style.background = 'var(--color-primary-500, #6366f1)';
    document.body.appendChild(bar);
    return bar;
}

router.on('start', () => {
    clearTimeout(progressTimeout);
    if (progressBar) progressBar.remove();
    progressBar = createProgressBar();
    // Force reflow then animate to 70%
    progressBar.offsetWidth;
    progressBar.style.width = '70%';
});

router.on('finish', () => {
    if (!progressBar) return;
    progressBar.style.width = '100%';
    const bar = progressBar;
    progressTimeout = setTimeout(() => {
        bar.style.transition = 'opacity 200ms ease';
        bar.style.opacity = '0';
        setTimeout(() => bar.remove(), 200);
    }, 100);
    progressBar = null;
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
