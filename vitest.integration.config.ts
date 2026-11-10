import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

// Live tests against the Supabase project. Node-side only: loads .env.local (incl. the secret key).
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    env: loadEnv('development', process.cwd(), ''),
    testTimeout: 30_000,
  },
})
