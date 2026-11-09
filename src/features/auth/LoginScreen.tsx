import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { Mail } from 'lucide-react'
import { useAuth } from '@/app/authContext'
import { Button } from '@/components/ui/Button'
import { supabase, supabaseConfigured } from '@/lib/supabase'

const EMAIL_KEY = 'lifehub.email'

function loadEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Human message for Supabase auth errors; never shows raw server text with details. */
function authMessage(err: { message?: string; status?: number; code?: string }): string {
  const m = (err.message ?? '').toLowerCase()
  if (err.status === 429 || m.includes('rate limit') || m.includes('security purposes'))
    return 'Слишком часто. Подожди минуту и попробуй снова.'
  if (m.includes('signups not allowed') || m.includes('not found') || err.code === 'otp_disabled')
    return 'Этот адрес не подключён к Life Hub.'
  if (m.includes('expired') || m.includes('invalid')) return 'Код не подошёл или устарел. Запроси новое письмо.'
  if (m.includes('fetch') || m.includes('network')) return 'Нет сети. Попробуй, когда появится связь.'
  return 'Не получилось. Попробуй ещё раз.'
}

const field =
  'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-body text-ink outline-none focus:border-ink2'

export function LoginScreen() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState(loadEmail)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!loading && session) return <Navigate to="/" replace />

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    const addr = email.trim().toLowerCase()
    if (!addr) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (err) return setError(authMessage(err))
    try {
      localStorage.setItem(EMAIL_KEY, addr)
    } catch {
      // ignore
    }
    setSentTo(addr)
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    if (!sentTo) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.verifyOtp({ email: sentTo, token: code.trim(), type: 'email' })
    setBusy(false)
    if (err) setError(authMessage(err))
  }

  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-big font-semibold tracking-[-0.01em]">Life Hub</h1>
        <p className="m-0 text-body text-ink2">Деньги, работа, учёба и тело — спокойно, в одном месте.</p>
      </div>

      {!supabaseConfigured && (
        <p className="m-0 rounded-xl bg-amber-soft p-3 text-cap font-semibold text-amber-ink">
          Нет настроек Supabase: заполни .env.local (см. README).
        </p>
      )}

      {sentTo === null ? (
        <form onSubmit={send} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-cap font-semibold text-ink2">E-mail</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </label>
          <Button type="submit" disabled={busy || !email.trim()}>
            Отправить ссылку
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-2xl border border-line bg-card p-4">
            <Mail size={20} strokeWidth={1.75} className="mt-0.5 flex-none text-ink2" aria-hidden="true" />
            <div className="text-body">
              Письмо ушло на <span className="font-semibold [overflow-wrap:anywhere]">{sentTo}</span>. Открой ссылку — или
              введи код из письма здесь. На телефоне в установленном приложении нужен код.
            </div>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-cap font-semibold text-ink2">Код из письма</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${field} text-title tracking-[0.2em] tabular-nums`}
            />
          </label>
          <Button type="submit" disabled={busy || code.length < 6}>
            Войти
          </Button>
          <div className="flex gap-2">
            <Button variant="quiet" onClick={() => send()} disabled={busy}>
              Отправить ещё раз
            </Button>
            <Button variant="quiet" onClick={() => (setSentTo(null), setCode(''), setError(null))}>
              Другой адрес
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="m-0 text-cap font-semibold text-amber-ink">
          {error}
        </p>
      )}
    </main>
  )
}
