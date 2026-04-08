import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg', 'icons.svg'],
      manifest: {
        name: 'Setka — Расписание',
        short_name: 'Setka',
        description: 'Легкое и быстрое расписание ОмГУ',
        theme_color: '#0c101a',
        background_color: '#0c101a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'web-app-manifest-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        shortcuts: [
          {
            name: 'Избранное',
            short_name: 'Избранное',
            description: 'Ваши сохраненные расписания',
            url: '/',
            icons: [{ src: 'favicon-96x96.png', sizes: '96x96' }]
          },
          {
            name: 'Преподаватели',
            short_name: 'Преп.',
            description: 'Поиск преподавателей и их предметов',
            url: '/tutors',
            icons: [{ src: 'favicon-96x96.png', sizes: '96x96' }]
          }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/api\/v1\/schedule\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-schedule-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\/api\/v1\/(groups|tutors|auditories|search).*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-meta-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  }
})
