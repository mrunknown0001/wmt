import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { apiFetch } from './utils';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

let app = null;
let messaging = null;

function getFirebaseMessaging() {
    if (!messaging) {
        app = initializeApp(firebaseConfig);
        messaging = getMessaging(app);
    }
    return messaging;
}

/**
 * Request notification permission, get FCM token, and register it with the backend.
 * Returns the token string on success, or null if denied/unsupported.
 */
export async function registerPushToken() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        console.log('[FCM] Browser does not support notifications or service workers');
        return null;
    }

    if (!firebaseConfig.apiKey || !vapidKey) {
        console.warn('[FCM] Missing env vars — apiKey:', !!firebaseConfig.apiKey, 'vapidKey:', !!vapidKey);
        return null;
    }

    console.log('[FCM] Requesting notification permission...');
    const permission = await Notification.requestPermission();
    console.log('[FCM] Permission result:', permission);
    if (permission !== 'granted') {
        return null;
    }

    try {
        console.log('[FCM] Waiting for service worker...');
        const registration = await navigator.serviceWorker.ready;
        console.log('[FCM] Service worker ready, scope:', registration.scope);

        const msg = getFirebaseMessaging();
        console.log('[FCM] Getting FCM token...');
        const token = await getToken(msg, {
            vapidKey,
            serviceWorkerRegistration: registration,
        });
        console.log('[FCM] Token received:', token ? token.substring(0, 20) + '...' : 'null');

        if (token) {
            const res = await apiFetch('/api/device-tokens', {
                method: 'POST',
                body: JSON.stringify({ token, platform: 'web' }),
            });
            console.log('[FCM] Token registered with backend, status:', res.status);
        }

        return token;
    } catch (err) {
        console.error('[FCM] Failed to get FCM token', err);
        return null;
    }
}

/**
 * Listen for foreground FCM messages.
 * Calls the provided callback with the message payload.
 */
export function onForegroundMessage(callback) {
    try {
        const msg = getFirebaseMessaging();
        return onMessage(msg, callback);
    } catch {
        return () => {};
    }
}
