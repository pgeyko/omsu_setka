import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter useTransitions={false}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

// Notification clicks are handled by the FCM service worker. It is scoped to
// /firebase-cloud-messaging-push-scope, so it asks an open app window to route
// instead of navigating it directly.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as { type?: string; url?: string } | null;
    if (!data || data.type !== 'notification-navigate' || typeof data.url !== 'string') return;
    try {
      const target = new URL(data.url, window.location.origin);
      if (target.origin === window.location.origin) window.location.assign(target.href);
    } catch {
      /* ignore malformed URLs */
    }
  });
}

// vite-plugin-pwa generates sw.js in production. Register it manually because
// the plugin's script injection is not compatible with the Rolldown bundler.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed.', error);
    });
  });
}
