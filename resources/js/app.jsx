import { createInertiaApp, router } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './ThemeContext';
import './echo';

// Try to import Ziggy, fallback to simple URL builder
let route = function(name, params = {}) {
    // Try to use Ziggy if available
    if (typeof window.Ziggy !== 'undefined') {
        try {
            const { route: ziggyRoute } = require('ziggy-js');
            return ziggyRoute(name, params);
        } catch (e) {
            console.warn('Ziggy available but failed to use:', e);
        }
    }

    // Fallback: simple URL builder for Laravel resource routes
    const parts = name.split('.');

    // Normalize params to array format
    let paramArray = [];
    if (Array.isArray(params)) {
        paramArray = params;
    } else if (typeof params === 'object' && params !== null && Object.keys(params).length > 0) {
        paramArray = Object.values(params);
    } else if (params && typeof params !== 'object') {
        paramArray = [params];
    }

    // Map resource actions to their URL patterns
    const routePatterns = {
        'index': '',
        'create': '/create',
        'store': '',
        'show': '/{id}',
        'edit': '/{id}/edit',
        'update': '/{id}',
        'destroy': '/{id}',
    };

    const lastPart = parts[parts.length - 1];
    const pattern = routePatterns[lastPart];

    let url;
    if (pattern !== undefined) {
        // This is a resource route
        const resourceParts = parts.slice(0, -1);

        // Build URL with nested resources
        // For approval-projects.chains.index with param [projectId]
        // We want: /approval-projects/{projectId}/chains
        url = '';
        let paramIndex = 0;

        for (let i = 0; i < resourceParts.length; i++) {
            url += '/' + resourceParts[i];

            // After each non-final resource part, insert a parameter
            if (i < resourceParts.length - 1 && paramIndex < paramArray.length) {
                url += '/' + paramArray[paramIndex];
                paramIndex++;
            }
        }

        // Add the action pattern
        url += pattern;

        // Replace any remaining {id} placeholders with remaining params
        while (paramIndex < paramArray.length && url.includes('{id}')) {
            url = url.replace('{id}', paramArray[paramIndex]);
            paramIndex++;
        }
    } else {
        // Custom route - join all parts
        url = '/' + parts.join('/');

        // Replace parameters
        paramArray.forEach((param) => {
            url = url.replace(/{id}/, param).replace(/:id/, param);
        });
    }

    return url;
};

// Make route helper globally available
window.route = route;

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
