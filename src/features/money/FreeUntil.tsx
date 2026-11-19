import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/components/ui/cn'
import { formatDayMonth, todayBerlin } from '@/lib/dates'
import { formatEstimate, formatEur } from '@/lib/format'
import { freeUntil } from '@/lib/rules/forecast'
import { useAccounts, useAllWeekLimits, useDebts, useEnvelopes, usePaydays, usePlanTransactions } from './api'

const eur = (c: number) => formatEur(c, { whole: true })
const signedEur = (c: number) => (c < 0 ? `−${eur(-c)}` : eur(c))

/** «Свободно до …» (stage 2): the number, or null while the data comes. */
function useFreeUntil() {
  const txs = usePlanTransactions()
  const accounts = useAccounts()
  const limits = useAllWeekLimits()
  const envelopes = useEnvelopes()
  const debts = useDebts()
  const paydays = usePaydays()
  if (txs.isPending || accounts.isPending || limits.isPending || envelopes.isPending || debts.isPending || paydays === null) return null
  if (!(txs.data ?? []).length) return null
  return freeUntil({ txs: txs.data ?? [], accounts: accounts.data ?? [], limits: limits.data ?? [], envelopes: envelopes.data ?? [], debts: debts.data ?? [], today: todayBerlin(), paydays })
}

/**
 * «Свободно до 27.11 · −201 €» — one quiet row. On «Деньги» a tap opens the numbers it is made of (no reasons, no
 * advice); on «Сегодня» the row leads to «Деньги».
 */
export function FreeUntilRow({ to }: { to?: string }) {
  const r = useFreeUntil()
  const [open, setOpen] = useState(false)
  if (!r) return null
  const head = (
    <>
      <span className="size-2 flex-none rounded-full bg-money" />
      <span className="min-w-0 flex-1">
        Свободно до {formatDayMonth(r.until ?? r.windowEnd)} · <span className="font-semibold tabular-nums">{formatEstimate(r.cents)}</span>
      </span>
    </>
  )
  const row = 'flex min-h-11 w-full items-center gap-2 rounded-xl bg-sub px-4 text-left text-base text-ink no-underline active:bg-line2'
  if (to) {
    return (
      <Link to={to} className={row}>
        {head}
        <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
      </Link>
    )
  }
  const { nowCents, outCents, inCents, lifeCents, reservedCents } = r.parts
  const parts = [
    ['сейчас на «Балансе»', nowCents],
    ['уходит по плану', -outCents],
    ['переводы в «Баланс»', inCents],
    ['«Жизнь» по плану', -lifeCents],
    ['отложено на «Балансе»', -reservedCents],
  ] as const
  return (
    <div className="flex flex-col rounded-xl bg-sub">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={cn(row, 'bg-transparent')}>
        {head}
        <ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" className={cn('flex-none text-ink3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="m-0 flex list-none flex-col gap-1 px-4 pb-3 text-cap text-ink2 tabular-nums">
          {parts
            .filter(([, c], i) => i === 0 || c !== 0)
            .map(([label, c]) => (
              <li key={label} className="flex justify-between gap-3">
                <span>{label}</span>
                <span>{c > 0 && label !== 'сейчас на «Балансе»' ? `+${eur(c)}` : signedEur(c)}</span>
              </li>
            ))}
          <li className="flex justify-between gap-3 border-t border-line2 pt-1 font-semibold text-ink">
            <span>{r.until ? `до ${formatDayMonth(r.until)} — ${r.payday ? 'день денег' : 'следующий доход'}` : `до ${formatDayMonth(r.windowEnd)}`}</span>
            <span>{signedEur(r.cents)}</span>
          </li>
        </ul>
      )}
    </div>
  )
}
