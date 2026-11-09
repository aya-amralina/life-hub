import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

// Node-side only: loads .env.local (incl. service role for test login) into process.env for tests.
Object.assign(process.env, loadEnv('development', process.cwd(), ''))

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'ru-RU',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
