/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg', 'fonts/*.woff2'],
      manifest: {
        name: 'Life Hub',
        short_name: 'Life Hub',
        description: 'Деньги, работа, учёба и тело — в одном месте',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F6F4EF',
        theme_color: '#F6F4EF',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/auth\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // react-dom + supabase-js + router ≈ 190 kB gzip; cached by the service worker after first load.
  build: { chunkSizeWarningLimit: 800 },
  server: { port: 5173, strictPort: true },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
