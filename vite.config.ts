import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
// Android (Capacitor) serves dist/ from the WebView root, so it needs base '/'.
const CAP_BUILD = !!process.env.CAP_BUILD

export default defineConfig({
  base: CAP_BUILD ? '/' : '/picstroom/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __CAP_BUILD__: JSON.stringify(CAP_BUILD)
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The APK bundles its assets; a service worker there only risks serving stale files.
      disable: CAP_BUILD,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'PicStroom',
        short_name: 'PicStroom',
        description: 'Visual inspiration browser - images from RSS feeds',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'any',
        start_url: '/picstroom/',
        scope: '/picstroom/',
        icons: [
          { src: '/picstroom/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/picstroom/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/picstroom/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/picstroom/index.html',
        navigateFallbackAllowlist: [/^\/picstroom/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // Resized thumbnails (CORS, small WebP): bounded LRU cache so the grid works offline.
            urlPattern: /^https:\/\/wsrv\.nl\/\?/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'thumbs-v1',
              expiration: {
                maxEntries: 1500,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true
              },
              // Only cache real (CORS) responses. Opaque responses (status 0) are counted as
              // ~7 MB each by browsers and previously exhausted the storage quota.
              cacheableResponse: { statuses: [200] }
            }
          },
          {
            urlPattern: /^https:\/\/picstroom-proxy\.pages\.dev\/\?/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'feeds-cache',
              networkTimeoutSeconds: 12,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5847,
    host: '0.0.0.0'
  },
  preview: {
    port: 5847,
    host: '0.0.0.0'
  }
})
