import { createClient } from '@supabase/supabase-js'
import type { Database } from './db/types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const rawKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

// Only a publishable key may ever reach the browser; a secret key here is a config mistake.
const publishableKey = rawKey?.startsWith('sb_secret_') ? undefined : rawKey

/** False when VITE_SUPABASE_* env vars are missing — the app shows a setup hint instead of crashing. */
export const supabaseConfigured = Boolean(url && publishableKey)

export const supabase = createClient<Database>(
  url ?? 'http://localhost:54321',
  publishableKey ?? 'sb_publishable_missing',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
    },
  },
)
