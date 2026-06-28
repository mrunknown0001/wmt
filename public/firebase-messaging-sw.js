// Firebase Messaging Service Worker
// No Firebase SDK needed here — the main thread handles token management.
// This SW only displays notifications and handles clicks.

// Handle background push messages (when the app tab is not focused or closed)
self.addEventListener('push', (event) => {
    if (!event.data) return;

    // Skip if any WMT tab is focused — Echo handles foreground notifications
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            const hasFocusedTab = clientList.some((c) => c.visibilityState === 'visible');
            if (hasFocusedTab) return;

            let payload;
            try {
                payload = event.data.json();
            } catch {
                return;
            }

            const notification = payload.notification || {};
            const data = payload.data || {};

            const title = notification.title || 'WMT';
            const options = {
                body: notification.body || '',
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                data: data,
                tag: data.notification_id || undefined,
            };

            return self.registration.showNotification(title, options);
        })
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
