import { createInertiaApp, router } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './ThemeContext';
import './echo';
import { route as ziggyRoute } from 'ziggy-js';

// Global route helper - will be updated when Inertia loads with Ziggy routes
let route = function(name, params = {}) {
    // Will use Ziggy when available via Inertia props
    // This is set up in the createInertiaApp setup function
    return ziggyRoute(name, params);
};

// Fallback route function for when Ziggy hasn't loaded yet
let fallbackRoute = function(name, params = {}) {
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

        // For routes with dynamic parameters (like forms-approval.submit which maps to /forms-approval/{uuid})
        // Try to match route patterns
        if (name === 'forms-approval.submit' && paramArray.length > 0) {
            // This is /forms-approval/{uuid}
            url = `/forms-approval/${paramArray[0]}`;
        } else if (name === 'forms.submit' && paramArray.length > 0) {
            // This is /forms/{uuid}
            url = `/forms/${paramArray[0]}`;
        } else {
            // Fallback: replace any {placeholder} patterns
            paramArray.forEach((param, index) => {
                // Try common placeholder names
                url = url.replace(/{id}/, param).replace(/:id/, param);
                url = url.replace(/{uuid}/, param).replace(/:uuid/, param);
                // If still no replacement, try replacing the last URL segment
                if (!url.includes(param) && index === 0) {
                    const parts = url.split('/');
                    if (parts[parts.length - 1] && !parts[parts.length - 1].includes('.')) {
                        parts[parts.length - 1] = param;
                        url = parts.join('/');
                    }
                }
            });
        }
    }

    return url;
};

// Make route helper globally available (will be updated in Inertia setup)
window.route = route;
window.fallbackRoute = fallbackRoute;

// Register Firebase service worker for push notifications
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/firebase-messaging-sw.js').catch((err) => {
        console.warn('Firebase SW registration failed', err);
    });
}

/**
 * Page navigation progress indicator.
 *
 * Three things make this read better than a bar that simply appears:
 *
 *  - Nothing is shown for the first 180ms. Most navigations in this app finish
 *    faster than that, and a bar that flashes on every click is what makes a
 *    loading indicator feel cheap.
 *  - Progress trickles forward in shrinking steps instead of parking at a fixed
 *    percentage, so a slow request still looks like it is moving.
 *  - It completes to 100% and fades, rather than vanishing mid-bar.
 */
const NAV_SHOW_DELAY = 180;
const NAV_TRICKLE_INTERVAL = 300;
const NAV_TRICKLE_CEILING = 92;

let navBar = null;
let navShowTimer = null;
let navTrickleTimer = null;
let navDoneTimer = null;
let navProgress = 0;

function mountNavBar() {
    const bar = document.createElement('div');
    bar.id = 'nav-progress';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', 'Loading page');
    document.body.appendChild(bar);
    // Force a reflow so the first width change animates from 0 rather than
    // snapping straight to its target.
    bar.offsetWidth;
    return bar;
}

function setNavProgress(value) {
    navProgress = value;
    if (navBar) {
        navBar.style.width = `${value}%`;
        navBar.setAttribute('aria-valuenow', String(Math.round(value)));
    }
}

function clearNavTimers() {
    clearTimeout(navShowTimer);
    clearTimeout(navDoneTimer);
    clearInterval(navTrickleTimer);
    navShowTimer = navDoneTimer = navTrickleTimer = null;
}

router.on('start', () => {
    clearNavTimers();
    if (navBar) {
        navBar.remove();
        navBar = null;
    }

    navShowTimer = setTimeout(() => {
        navBar = mountNavBar();
        setNavProgress(18);

        // Each step covers a shrinking slice of what is left, so the bar keeps
        // moving without ever implying it is nearly done.
        navTrickleTimer = setInterval(() => {
            const remaining = NAV_TRICKLE_CEILING - navProgress;
            if (remaining <= 0.5) return;
            setNavProgress(navProgress + remaining * 0.25);
        }, NAV_TRICKLE_INTERVAL);
    }, NAV_SHOW_DELAY);
});

router.on('finish', () => {
    clearNavTimers();

    // Finished inside the delay window — nothing was ever shown, so there is
    // nothing to tidy up.
    if (!navBar) return;

    const bar = navBar;
    navBar = null;

    setNavProgress(100);
    bar.style.width = '100%';
    bar.classList.add('is-complete');

    navDoneTimer = setTimeout(() => bar.remove(), 400);
});

createInertiaApp({
    title: (title) => title ? `${title} - WMT` : 'WMT',
    // Lazy page resolution: Vite emits one chunk per page and fetches it on
    // demand. With { eager: true } every page was inlined into the entry bundle,
    // so the first paint downloaded all of them.
    resolve: (name) => resolvePageComponent(
        `./Pages/${name}.jsx`,
        import.meta.glob('./Pages/**/*.jsx'),
    ),
    setup({ el, App, props }) {
        // Initialize Ziggy with routes from Inertia props
        if (props.initialPage.props.ziggy) {
            window.Ziggy = props.initialPage.props.ziggy;
            // Update route function to use the Ziggy routes
            route = function(name, params = {}) {
                return ziggyRoute(name, params);
            };
            window.route = route;
        } else {
            // Fallback if Ziggy is not available
            route = fallbackRoute;
            window.route = route;
        }

        createRoot(el).render(
            <ThemeProvider>
                <App {...props} />
            </ThemeProvider>
        );
    },
});
