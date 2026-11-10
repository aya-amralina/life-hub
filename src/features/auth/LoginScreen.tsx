import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { Mail } from 'lucide-react'
import { useAuth } from '@/app/authContext'
import { Button } from '@/components/ui/Button'
import { supabase, supabaseConfigured } from '@/lib/supabase'
import { authMessage } from './authMessage'

const EMAIL_KEY = 'lifehub.email'

function loadEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveEmail(email: string): void {
  try {
    localStorage.setItem(EMAIL_KEY, email)
  } catch {
    // storage unavailable — the password manager still fills the field
  }
}

const field =
  'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'

/**
 * Main: e-mail + password (signInWithPassword) — the iPhone password manager fills both fields
 * (autocomplete="username" / "current-password"). Fallback for a browser: magic link by e-mail.
 */
export function LoginScreen() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState(loadEmail)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null)

  if (!loading && session) return <Navigate to="/" replace />

  const normalizedEmail = email.trim().toLowerCase()

  const signIn = async (e: FormEvent) => {
    e.preventDefault()
    if (!normalizedEmail || !password) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
    setBusy(false)
    if (err) return setError(authMessage(err))
    saveEmail(normalizedEmail)
  }

  const sendLink = async () => {
    if (!normalizedEmail) return setError('Впиши почту — ссылка придёт на неё.')
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (err) return setError(authMessage(err))
    saveEmail(normalizedEmail)
    setLinkSentTo(normalizedEmail)
  }

  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-big font-semibold tracking-[-0.01em]">Life Hub</h1>
        <p className="m-0 text-base text-ink2">Деньги, работа, учёба и тело — спокойно, в одном месте.</p>
      </div>

      {!supabaseConfigured && (
        <p className="m-0 rounded-xl bg-amber-soft p-3 text-cap font-semibold text-amber-ink">
          Нет настроек Supabase: заполни .env.local (см. README).
        </p>
      )}

      <form onSubmit={signIn} method="post" action="/login" className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-cap font-semibold text-ink2">E-mail</span>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-cap font-semibold text-ink2">Пароль</span>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
        </label>
        <Button type="submit" disabled={busy || !normalizedEmail || !password}>
          Войти
        </Button>
      </form>

      {error && (
        <p role="alert" className="m-0 text-cap font-semibold text-amber-ink">
          {error}
        </p>
      )}

      {linkSentTo ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4">
          <Mail size={20} strokeWidth={1.75} className="mt-0.5 flex-none text-ink2" aria-hidden="true" />
          <div className="text-base">
            Ссылка ушла на <span className="font-semibold [overflow-wrap:anywhere]">{linkSentTo}</span>. Открой письмо в этом
            же браузере — вход случится сам.
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-1">
          <Button variant="quiet" className="-mx-3" onClick={sendLink} disabled={busy}>
            Войти по ссылке из письма
          </Button>
          <span className="text-cap text-ink2">Запасной способ для браузера. В установленном приложении входи паролем.</span>
        </div>
      )}
    </main>
  )
}
