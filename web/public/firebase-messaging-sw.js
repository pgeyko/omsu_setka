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
            icon: '/web-app-manifest-192x192.png',
            badge: '/favicon-96x96.png',
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

// Robust notification click handler with window focusing
self.addEventListener('notificationclick', function(event) {
    console.log('[sw.js] Notification click received');
    event.notification.close();

    // Get the target URL from the notification data
    let targetUrl = event.notification.data?.url || '/';
    
    // Resolve relative URLs to absolute
    if (!targetUrl.startsWith('http')) {
        targetUrl = new URL(targetUrl, self.location.origin).href;
    }

    console.log('[sw.js] Target URL:', targetUrl);

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Check if any existing tab belongs to our domain
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                
                if (client.url.includes(self.location.host) && 'focus' in client) {
                    console.log('[sw.js] Matching tab found. Focusing and navigating...');
                    return client.focus().then((focusedClient) => {
                        return focusedClient.navigate(targetUrl);
                    });
                }
            }

            // If no tab is found, open a new window
            if (clients.openWindow) {
                console.log('[sw.js] No matching tab found. Opening new window.');
                return clients.openWindow(targetUrl);
            }
        })
    );
});
