import { describe, expect, it } from 'vitest'
import { assertNoSecretInClientEnv } from '../../vite.config'

describe('secret keys never reach the client bundle', () => {
  it('accepts the publishable key', () => {
    expect(() =>
      assertNoSecretInClientEnv({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' }),
    ).not.toThrow()
  })
  it('rejects a secret key in a VITE_ variable', () => {
    expect(() => assertNoSecretInClientEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toThrow(/VITE_SUPABASE_PUBLISHABLE_KEY/)
  })
  it('rejects secret-looking VITE_ names', () => {
    expect(() => assertNoSecretInClientEnv({ VITE_SUPABASE_SECRET_KEY: 'x' })).toThrow()
    expect(() => assertNoSecretInClientEnv({ VITE_SUPABASE_SERVICE_ROLE_KEY: 'x' })).toThrow()
  })
  it('ignores non-VITE variables (server-only secret is fine)', () => {
    expect(() => assertNoSecretInClientEnv({ SUPABASE_SECRET_KEY: 'sb_secret_abc' })).not.toThrow()
  })
})
