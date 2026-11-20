import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/components/ui/cn'
import { formatDayMonth } from '@/lib/dates'
import { formatEstimate, formatEur } from '@/lib/format'
import { useFreeUntil } from './api'

const eur = (c: number) => formatEur(c, { whole: true })
const signedEur = (c: number) => (c < 0 ? `−${eur(-c)}` : eur(c))
type Free = NonNullable<ReturnType<typeof useFreeUntil>>

/**
 * «Свободно до 27.11 · 64 €» on «Сегодня» — one quiet row that leads to «Деньги» (`to`). Without `to` (older places)
 * a tap opens the numbers it is made of.
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
  return (
    <div className="flex flex-col rounded-xl bg-sub">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={cn(row, 'bg-transparent')}>
        {head}
        <ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" className={cn('flex-none text-ink3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <FreeParts r={r} className="px-4 pb-3" />}
    </div>
  )
}

/**
 * «Сейчас» (docs/money-redesign.md, phase 4): the one main number of «Деньги» — «Свободно до 27.11», 64 € — and
 * «как посчитано», the formula on today's numbers (no reasons, no advice).
 */
export function FreeUntilHero() {
  const r = useFreeUntil()
  const [open, setOpen] = useState(false)
  if (!r) return null
  return (
    <section aria-label="Свободно до дня денег" className="flex flex-col gap-1">
      <span className="text-cap text-ink2">Свободно до {formatDayMonth(r.until ?? r.windowEnd)}</span>
      <div className="flex items-end justify-between gap-3">
        <span className={cn('text-big font-semibold tabular-nums', r.cents < 0 && 'text-red')}>{formatEstimate(r.cents)}</span>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="-mr-2 flex min-h-11 items-center gap-1 rounded-xl px-2 text-cap text-ink2 active:bg-sub">
          как посчитано
          <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open && <FreeParts r={r} className="rounded-xl bg-sub px-4 py-3" />}
    </section>
  )
}

/** The numbers «Свободно до …» is made of, in the order of the formula. */
function FreeParts({ r, className }: { r: Free; className?: string }) {
  const { nowCents, outCents, inCents, lifeCents, reservedCents } = r.parts
  const parts = [
    ['сейчас на «Балансе»', nowCents],
    ['отложено на «Балансе»', -reservedCents],
    ['уходит по плану', -outCents],
    ['переводы в «Баланс»', inCents],
    ['«Жизнь» по плану', -lifeCents],
  ] as const
  return (
    <ul className={cn('m-0 flex list-none flex-col gap-1 text-cap text-ink2 tabular-nums', className)}>
      {parts
        .filter(([, c], i) => i === 0 || c !== 0)
        .map(([label, c], i) => (
          <li key={label} className="flex justify-between gap-3">
            <span>{label}</span>
            <span>{c > 0 && i > 0 ? `+${eur(c)}` : signedEur(c)}</span>
          </li>
        ))}
      <li className="flex justify-between gap-3 border-t border-line2 pt-1 font-semibold text-ink">
        <span>{r.until ? `до ${formatDayMonth(r.until)} — ${r.payday ? 'день денег' : 'следующий доход'}` : `до ${formatDayMonth(r.windowEnd)}`}</span>
        <span>{signedEur(r.cents)}</span>
      </li>
    </ul>
  )
}
