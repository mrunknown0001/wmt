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
        return null;
    }

    if (!firebaseConfig.apiKey || !vapidKey) {
        return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        const msg = getFirebaseMessaging();
        const token = await getToken(msg, {
            vapidKey,
            serviceWorkerRegistration: registration,
        });

        if (token) {
            await apiFetch('/api/device-tokens', {
                method: 'POST',
                body: JSON.stringify({ token, platform: 'web' }),
            });
        }

        return token;
    } catch (err) {
        console.error('[FCM] Failed to get token', err);
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
