import { createInertiaApp } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './ThemeContext';

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
