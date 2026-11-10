/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Refuse to build or serve if a secret key could end up in the client bundle (any VITE_* var). */
export function assertNoSecretInClientEnv(env: Record<string, string>): void {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_')) continue
    if (value.startsWith('sb_secret_') || /SECRET|SERVICE_ROLE/i.test(name)) {
      throw new Error(`${name}: secret keys must never be exposed via VITE_* variables`)
    }
  }
}

/** VITE_SUPABASE_URL, when set, must be exactly https://<ref>.supabase.co (no path, no trailing dot). */
export function assertSupabaseUrl(env: Record<string, string>): void {
  const url = env.VITE_SUPABASE_URL
  if (url && !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) {
    throw new Error('VITE_SUPABASE_URL must look like https://<ref>.supabase.co (no path, no trailing dot)')
  }
}

export default defineConfig(({ mode }) => {
  const clientEnv = loadEnv(mode, process.cwd(), 'VITE_')
  assertNoSecretInClientEnv(clientEnv)
  assertSupabaseUrl(clientEnv)

  return {
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
      include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
      environment: 'node',
    },
  }
})
