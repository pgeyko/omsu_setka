import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'сетка — расписание ОмГУ',
        short_name: 'сетка',
        description: 'Мгновенное расписание ОмГУ: сегодня, неделя, замены и уведомления.',
        lang: 'ru',
        start_url: '/',
        display: 'standalone',
        background_color: '#E9EAE3',
        theme_color: '#F7F8F3',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
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
