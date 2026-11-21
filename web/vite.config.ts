import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'notification-badge.png'],
      workbox: {
        globIgnores: ['firebase-messaging-sw.js'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/schedule\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'schedule',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 604800 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/v1\/(groups|tutors|auditories|search).*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'dictionaries',
              expiration: { maxEntries: 100, maxAgeSeconds: 604800 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
});
