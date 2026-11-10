/** Human message for Supabase auth errors; never shows raw server text. */
export function authMessage(err: { message?: string; status?: number; code?: string }): string {
  const m = (err.message ?? '').toLowerCase()
  if (err.code === 'invalid_credentials' || m.includes('invalid login credentials')) return 'Неверная почта или пароль.'
  if (err.status === 429 || err.code === 'over_email_send_rate_limit' || m.includes('rate limit') || m.includes('security purposes'))
    return 'Слишком часто. Подожди немного и попробуй снова.'
  if (err.code === 'otp_disabled' || err.code === 'signup_disabled' || m.includes('signups not allowed'))
    return 'Этот адрес не подключён к Life Hub.'
  if (m.includes('fetch') || m.includes('network')) return 'Нет сети. Попробуй, когда появится связь.'
  return 'Не получилось. Попробуй ещё раз.'
}
