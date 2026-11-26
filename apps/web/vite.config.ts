import { fileURLToPath } from 'node:url';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    // Generates src/routeTree.gen.ts from src/routes (file-based routing). Must run before react().
    tanstackRouter({ target: 'react' }),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Homa',
        short_name: 'Homa',
        description: 'Your calendars, tasks and routines in one place.',
        theme_color: '#22223b',
        background_color: '#22223b',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // The API is never cached by the service worker. push-sw.js adds web push (reminders).
      workbox: { navigateFallbackDenylist: [/^\/api\//], importScripts: ['/push-sw.js'] },
    }),
  ],
  server: {
    host: true,
    port: 5180,
    strictPort: true,
    // Override when PORT≠3000 (e.g. HOMA_API_ORIGIN=http://localhost:3001).
    proxy: { '/api': process.env.HOMA_API_ORIGIN ?? 'http://localhost:3000' },
    ...(process.env.CHOKIDAR_USEPOLLING === 'true' && { watch: { usePolling: true } }),
  },
});
