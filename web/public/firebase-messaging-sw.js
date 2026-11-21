// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker.
// These values are replaced by Vite during build (see vite.config.ts)
firebase.initializeApp({
  apiKey: "VITE_FIREBASE_API_KEY",
  authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "VITE_FIREBASE_PROJECT_ID",
  storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "VITE_FIREBASE_APP_ID",
  measurementId: "VITE_FIREBASE_MEASUREMENT_ID"
});

const messaging = firebase.messaging();

// Handle incoming push events manually to prevent duplicates
// and ensure we have full control over the notification display.
self.addEventListener('push', function(event) {
    if (!event.data) return;
    try {
        const payload = event.data.json();
        console.log('[sw.js] Push received:', payload);
        
        // Data comes from payload.data when sending from Go FCM client
        const d = payload.data;
        if (!d) return;

        const notificationTitle = d.title || "Setka — Расписание";
        const notificationOptions = {
            body: d.body || "Обновление в расписании",
            icon: '/icon-192.png',
            badge: '/notification-badge.png',
            tag: d.tag || 'schedule_event',
            renotify: true, // Allow replacing previous notifications with the same tag
            data: {
                url: d.click_url || '/' 
            }
        };

        event.waitUntil(
            self.registration.showNotification(notificationTitle, notificationOptions)
        );
    } catch (e) {
        console.error('[sw.js] Error processing push:', e);
    }
});

// Notification click handler. The FCM worker is registered with the
// /firebase-cloud-messaging-push-scope scope, so it cannot reliably navigate
// app windows outside that scope. Prefer an existing app window and ask the
// page to route; fall back to opening the target URL directly.
self.addEventListener('notificationclick', function(event) {
    console.log('[sw.js] Notification click received');
    event.notification.close();

    let targetUrl = event.notification.data?.url || '/';
    if (!targetUrl.startsWith('http')) {
        targetUrl = new URL(targetUrl, self.location.origin).href;
    }
    console.log('[sw.js] Target URL:', targetUrl);

    event.waitUntil((async function() {
        const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = clientList.find(function(client) {
            try {
                return new URL(client.url).origin === self.location.origin;
            } catch (error) {
                return false;
            }
        });

        if (existing) {
            if ('focus' in existing) {
                try { await existing.focus(); } catch (error) {}
            }
            if (existing.url === targetUrl) return;
            if (existing.navigate) {
                try {
                    const navigated = await existing.navigate(targetUrl);
                    if (navigated) return;
                } catch (error) {
                    console.warn('[sw.js] navigate() failed, asking the app to route', error);
                }
            }
            if (existing.postMessage) {
                existing.postMessage({ type: 'notification-navigate', url: targetUrl });
                return;
            }
        }

        if (clients.openWindow) {
            console.log('[sw.js] No app window found. Opening target URL.');
            await clients.openWindow(targetUrl);
        }
    })());
});
