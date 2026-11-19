import { formatDayMonth } from '@/lib/dates'
import { formatEur } from '@/lib/format'
import type { AccountsReconciliation } from '@/lib/rules/accounts'
import type { Reconciliation } from '@/lib/rules/money'

const eur = (c: number) => formatEur(c, { whole: true })
const signedEur = (c: number) => `${c > 0 ? '+' : '−'}${formatEur(Math.abs(c))}`

/** «Revolut · На месяц» → «На месяц»: the bank is clear from the list of accounts. */
export const shortName = (name: string) => name.replace(/^Revolut · /, '')

/** The common pot against «Остатки» written before the start by accounts. */
export function potCheckText(check: Reconciliation | null): string {
  if (check === null) return 'Реальных остатков пока нет — внеси их в воскресном обзоре, сравню с расчётом.'
  return `Остатки на ${formatDayMonth(check.date)}: ${eur(check.actualCents)}, по расчёту ${eur(check.calculatedCents)} — ${
    check.matches ? 'сходится' : `расхождение ${signedEur(check.diffCents)}`
  }.${check.missing.length ? ` Не внесены: ${check.missing.join(', ')}.` : ''}`
}

/** From the start: «Баланс» as a whole when every account of it is entered; accounts off by 1 € or more by name. */
export function accountsCheckText(r: AccountsReconciliation | null): string {
  if (r === null) return 'Остатков по счетам пока нет — внеси их в воскресном обзоре, сравню с расчётом.'
  const head = r.balance
    ? `Остатки на ${formatDayMonth(r.date)}: «Баланс» ${eur(r.balance.actualCents)}, по расчёту ${eur(r.balance.calculatedCents)}`
    : `Остатки на ${formatDayMonth(r.date)} по внесённым счетам`
  const verdict = r.matches
    ? ' — сходится.'
    : ` — расхождение: ${[
        ...(r.balance && Math.abs(r.balance.diffCents) >= 100 ? [`«Баланс» ${signedEur(r.balance.diffCents)}`] : []),
        ...r.off.map((c) => `${shortName(c.account.name)} ${signedEur(c.diffCents)}`),
      ].join(', ')}.`
  // short names; at most three, the rest counted
  const missing = r.missing.map(shortName)
  const tail = missing.length > 3 ? `${missing.slice(0, 3).join(', ')} и ещё ${missing.length - 3}` : missing.join(', ')
  return head + verdict + (missing.length ? ` Не внесены: ${tail}.` : '')
}
