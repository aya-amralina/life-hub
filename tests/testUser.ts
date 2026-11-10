// Credentials for automated tests. Tests sign in ONLY as the dedicated test user, never as the real
// account (LIFEHUB_EMAIL — that one is for the importer and check:keys). RLS keeps the users apart.

export type TestUser = { email: string; password: string }

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase()

/** Real project URL, not the .env.example placeholder. */
export function supabaseConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(env.VITE_SUPABASE_URL ?? '')
}

/** Test user from LIFEHUB_TEST_EMAIL / LIFEHUB_TEST_PASSWORD; null if not configured. */
export function testUser(env: NodeJS.ProcessEnv = process.env): TestUser | null {
  const email = norm(env.LIFEHUB_TEST_EMAIL)
  const password = env.LIFEHUB_TEST_PASSWORD ?? ''
  if (email && email === norm(env.LIFEHUB_EMAIL)) {
    throw new Error('LIFEHUB_TEST_EMAIL совпадает с LIFEHUB_EMAIL: тесты не входят под настоящим пользователем')
  }
  return email && password ? { email, password } : null
}
