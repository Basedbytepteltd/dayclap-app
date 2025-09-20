import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Use 'injectManifest' strategy to use your custom service worker
      // This ensures your push notification logic in public/sw.js is included
      strategies: 'injectManifest',
      srcDir: 'public', // Source directory for your service worker
      filename: 'sw.js', // Your custom service worker file
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'DayClap',
        short_name: 'DayClap',
        description: 'Your Smart Calendar Companion',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      devOptions: {
        enabled: true, // Enable service worker in development for easier testing
        type: 'module',
      },
    })
  ],
})
