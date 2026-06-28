// Firebase Messaging Service Worker
// No Firebase SDK needed here — the main thread handles token management.
// This SW only displays notifications and handles clicks.

// Handle push messages
self.addEventListener('push', (event) => {
    console.log('[SW] Push event received', event.data ? 'with data' : 'no data');
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch (e) {
        console.log('[SW] Failed to parse push data', e);
        return;
    }

    console.log('[SW] Push payload:', JSON.stringify(payload));

    const notification = payload.notification || {};

    event.waitUntil(
        self.registration.showNotification(notification.title || 'WMT', {
            body: notification.body || 'New notification',
        })
            .then(() => console.log('[SW] Notification shown successfully'))
            .catch((err) => console.error('[SW] showNotification FAILED:', err))
    );
});

// Handle notification click — open/focus the relevant page
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = event.notification.data || {};
    let url = '/';

    if (data.project_id && data.task_id) {
        url = `/projects/${data.project_id}/tasks/${data.task_id}/edit`;
    } else if (data.project_id) {
        url = `/projects/${data.project_id}`;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    client.navigate(url);
                    return;
                }
            }
            return clients.openWindow(url);
        })
    );
});
