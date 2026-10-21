import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Android (Capacitor) serves dist/ from the WebView root, so it needs base '/'.
  base: process.env.CAP_BUILD ? '/' : '/picstroom/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
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
          {
            src: '/picstroom/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/picstroom/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/picstroom/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/picstroom/index.html',
        navigateFallbackAllowlist: [/^\/picstroom/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|gif|webp|svg)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\/feed|rss|atom/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'feeds-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60
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
    port: 5847,
    host: '0.0.0.0'
  },
  preview: {
    port: 5847,
    host: '0.0.0.0'
  }
})
