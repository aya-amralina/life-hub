import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { useAddAction } from '@/app/addSheetContext'
import { Card, CardHeader } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { MetaChip } from '@/components/ui/MetaChip'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { cn } from '@/components/ui/cn'
import { addDaysISO, formatDayMonth, todayBerlin } from '@/lib/dates'
import { formatEur, joinRu, plural } from '@/lib/format'
import { wishDue, wishHoursLeft, wishSavedCents } from '@/lib/rules/wishlist'
import { accountsStart } from '@/lib/rules/accounts'
import { currentPeriodMonth, periodName } from '@/lib/rules/periods'
import type { PlannedItem } from '@/lib/rules/plan'
import { doneItems, planPeriods, somedayItems, type PeriodLine } from '@/lib/rules/planPeriods'
import { DebtSheet } from './DebtSheet'
import { OperationSheet } from './OperationSheet'
import { PlanItemSheet } from './PlanItemSheet'
import { WishQuestions } from './WishQuestions'
import { useWishlist } from './wishlistApi'
import { useAccounts, useAllWeekLimits, useDebts, useEnvelopes, useFreeUntil, usePaydays, usePlanTransactions, usePlannedItems, type Debt, type PlanTx } from './api'

const eur = (c: number) => formatEur(c, { whole: true })
/** below zero with «−» (U+2212), as everywhere in «Деньги» */
const signed = (c: number) => (c < 0 ? `\u2212${eur(-c)}` : eur(c))
const row = 'flex min-h-12 w-full items-center gap-3 border-t border-line py-2 text-left first:border-t-0'

/**
 * План (docs/money-redesign.md, phase 3): everything about the future, by periods — today's (told by «Свободно до …»),
 * the next two with what comes in, what leaves and «на жизнь»; «Когда-нибудь»; «Готово» folded. A tap opens the item:
 * a spending — the one plan form, a debt or an operation — its own sheet. «+» — a new spending into the plan.
 */
export function PlanTab() {
  const items = usePlannedItems()
  const txs = usePlanTransactions()
  const accounts = useAccounts()
  const limits = useAllWeekLimits()
  const paydays = usePaydays()
  const debts = useDebts()
  const envelopes = useEnvelopes()
  const free = useFreeUntil()
  const wishes = useWishlist()
  const [editing, setEditing] = useState<PlannedItem | 'new' | null>(null)
  const [debt, setDebt] = useState<Debt | null>(null)
  const [operation, setOperation] = useState<PlanTx | null>(null)
  const [doneOpen, setDoneOpen] = useState(false)
  useAddAction(() => setEditing('new'))
  if (items === null || paydays === null || txs.isPending || limits.isPending || accounts.isPending) return <SkeletonCard />

  const today = todayBerlin()
  const all = txs.data ?? []
  const accountList = accounts.data ?? []
  const names = new Map(accountList.map((a) => [a.id, a.name]))
  const periods = planPeriods({ items, txs: all, accounts: accountList, limits: limits.data ?? [], start: accountsStart(all), today, paydays, currentMonth: currentPeriodMonth(today, paydays) })
  const someday = somedayItems(items)
  // wishes (the old «Хотелки», phase 5): still thinking — «ещё N ч»; what deciding «не покупать» saved
  const wishList = wishes.data ?? []
  const nowDate = new Date()
  const thinking = new Map(wishList.filter((w) => w.decision === null && !wishDue(w, nowDate)).map((w) => [w.id, wishHoursLeft(w, nowDate)]))
  const skipped = wishList.filter((w) => w.decision === 'skip')
  const saved = wishSavedCents(wishList)
  const done = doneItems(items)
  const open = (it: PlannedItem) => {
    if (it.source === 'envelope' || it.source === 'wish') setEditing(it)
    else if (it.source === 'debt') setDebt((debts.data ?? []).find((d) => d.id === it.sourceId) ?? null)
    else setOperation(all.find((t) => t.id === it.sourceId) ?? null)
  }

  return (
    <>
      {periods.map((p) => (
        <PeriodCard key={p.month} p={p} today={today} names={names} free={p.current ? free : null} onOpen={open} />
      ))}

      <WishQuestions />
      <Card>
        <CardHeader title="Когда-нибудь" context={someday.length ? eur(someday.reduce((s, it) => s + it.amountCents, 0)) : undefined} />
        {someday.length === 0 ? (
          <p className="m-0 text-cap text-ink2">То, что хочется, но без срока. Захотелось купить сразу — «+», «Когда-нибудь» и «Подумать 48 часов»: потом спрошу один раз, нужно ли ещё.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {someday.map((it) => {
              const h = it.source === 'wish' ? thinking.get(it.sourceId) : undefined
              return (
                <li key={it.key}>
                  <ItemRow it={it} names={names} apart={false} onOpen={open} extra={h !== undefined ? `думаю · ещё ${h} ${plural(h, ['час', 'часа', 'часов'])}` : undefined} />
                </li>
              )
            })}
          </ul>
        )}
        {saved > 0 && (
          <p className="m-0 text-cap text-ink2 tabular-nums">
            Решила не покупать: {skipped.length} · не потрачено {eur(saved)}
          </p>
        )}
      </Card>

      {done.length > 0 && (
        <Card>
          <GroupHeader title="Готово" count={done.length} summary={<span className="truncate">{joinRu(done.slice(0, 3).map((it) => it.title))}</span>} open={doneOpen} onToggle={() => setDoneOpen(!doneOpen)} />
          {doneOpen && (
            <ul className="m-0 flex list-none flex-col p-0">
              {done.map((it) => (
                <li key={it.key}>
                  <DoneRow it={it} onOpen={open} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* every operation of a month (income, transfers, «Показать убранные») and the forecast — one tap deeper */}
      <Link to="/money/month" className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-card px-4 text-base text-ink no-underline active:bg-sub">
        <span className="min-w-0 flex-1">
          Все операции и прогноз <span className="text-ink2">· «Месяц»</span>
        </span>
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
      </Link>

      <PlanItemSheet open={editing !== null} onClose={() => setEditing(null)} item={editing === 'new' ? null : editing} />
      <DebtSheet open={debt !== null} onClose={() => setDebt(null)} debt={debt} goals={(envelopes.data ?? []).filter((e) => e.type === 'goal')} />
      <OperationSheet open={operation !== null} onClose={() => setOperation(null)} tx={operation} />
    </>
  )
}

function PeriodCard({
  p,
  today,
  names,
  free,
  onOpen,
}: {
  p: PeriodLine
  today: string
  names: Map<string, string>
  free: ReturnType<typeof useFreeUntil>
  onOpen: (it: PlannedItem) => void
}) {
  const [recurringOpen, setRecurringOpen] = useState(false)
  const name = periodName(p.month, today)
  const nextDay = addDaysISO(p.end, 1)
  const title = p.current ? `${name} · до ${formatDayMonth(free?.until ?? nextDay)}` : `${name} · с ${formatDayMonth(p.start)}`
  const short = p.current ? (free && free.cents < 0 ? -free.cents : 0) : p.shortCents
  const context =
    short > 0 ? (
      <MetaChip kind="late" text={`не сходится на ${eur(short)}`} />
    ) : p.current ? (
      free ? <MetaChip kind="ok" text="сходится" /> : undefined
    ) : (
      <span className="tabular-nums">на жизнь {eur(p.lifeCents ?? 0)}</span>
    )
  const empty = p.items.length === 0 && p.recurring.length === 0
  return (
    <Card>
      <CardHeader title={title} dotClass="bg-money" context={context} />
      {!p.current && p.incomeCents > 0 && <SumRow label="Поступления" cents={p.incomeCents} />}
      {p.recurring.length > 0 && (
        <div className="flex flex-col">
          <button type="button" aria-expanded={recurringOpen} onClick={() => setRecurringOpen(!recurringOpen)} className={cn(row, 'border-t-0')}>
            <span className="min-w-0 flex-1 text-base">
              Регулярные <span className="text-ink2 tabular-nums">({p.recurring.length})</span>
            </span>
            <span className="text-base tabular-nums">{eur(p.recurring.reduce((s, it) => s + it.leftCents, 0))}</span>
            <ChevronDown size={20} strokeWidth={1.75} aria-hidden="true" className={cn('flex-none text-ink3 transition-transform', recurringOpen && 'rotate-180')} />
          </button>
          {recurringOpen && (
            <ul className="m-0 flex list-none flex-col p-0 pl-4">
              {p.recurring.map((it) => (
                <li key={it.key}>
                  <ItemRow it={it} names={names} apart={p.apart.has(it.key)} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {p.items.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {p.items.map((it) => (
            <li key={it.key}>
              <ItemRow it={it} names={names} apart={p.apart.has(it.key)} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
      {empty && <p className="m-0 text-cap text-ink2">Пока ничего не запланировано.</p>}
      {p.current ? (
        free && (
          <div className="flex items-baseline justify-between gap-3 border-t border-line2 pt-3 text-base">
            <span>Свободно до {formatDayMonth(free.until ?? free.windowEnd)}</span>
            <span className={cn('font-semibold tabular-nums', free.cents < 0 && 'text-red')}>{signed(free.cents)}</span>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-1 border-t border-line2 pt-3">
          <div className="flex items-baseline justify-between gap-3 text-base">
            <span className="font-semibold">На жизнь</span>
            <span className={cn('font-semibold tabular-nums', p.shortCents > 0 && 'text-red')}>{signed(p.lifeCents!)}</span>
          </div>
          {p.shortCents > 0 ? (
            <p className="m-0 text-cap text-ink2">
              {name} не сходится на {eur(p.shortCents)}. Перенеси что-нибудь в другой период — тап по трате, «Из каких денег».
            </p>
          ) : (
            p.perWeekCents !== null && (
              <p className="m-0 text-cap text-ink2 tabular-nums">
                ≈ {eur(p.perWeekCents)} в неделю{p.limitWeekCents ? ` · лимит недели ${eur(p.limitWeekCents)}` : ''}
              </p>
            )
          )}
        </div>
      )}
    </Card>
  )
}

function SumRow({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 text-base">
      <span>{label}</span>
      <span className="tabular-nums">{eur(cents)}</span>
    </div>
  )
}

const KIND_META: Record<string, string> = { debt: 'вернуть долг', to_goal: 'в копилку' }

/** One item: title, what matters for a decision (date, where the money is), the sum on the right. */
function ItemRow({ it, names, apart, onOpen, extra }: { it: PlannedItem; names: Map<string, string>; apart: boolean; onOpen: (it: PlannedItem) => void; extra?: string }) {
  const meta: string[] = extra ? [extra] : []
  if (KIND_META[it.kind]) meta.push(KIND_META[it.kind]!)
  if (it.date) meta.push(it.source === 'debt' ? `до ${formatDayMonth(it.date)}` : formatDayMonth(it.date))
  if (apart && it.reservedEarly) meta.push('отложено заранее')
  else if (apart && it.accountId) meta.push(`лежит на ${names.get(it.accountId) ?? 'другом счёте'}`)
  const spent = it.spentCents > 0
  return (
    <button type="button" onClick={() => onOpen(it)} className={row}>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-base [overflow-wrap:anywhere]">{it.title || 'Без названия'}</span>
        {meta.length > 0 && <span className="text-cap text-ink2">{meta.join(' · ')}</span>}
        {spent && <ProgressBar value={it.spentCents} max={it.amountCents} fillClass="bg-money" label={`${it.title}: потрачено`} />}
      </span>
      <span className="flex flex-none flex-col items-end">
        <span className="text-base tabular-nums">{eur(it.leftCents)}</span>
        {spent && <span className="text-cap text-ink2 tabular-nums">из {eur(it.amountCents)}</span>}
      </span>
    </button>
  )
}

function DoneRow({ it, onOpen }: { it: PlannedItem; onOpen: (it: PlannedItem) => void }) {
  const over = it.spentCents - it.amountCents
  const clickable = it.source === 'envelope' || it.source === 'debt'
  const body = (
    <>
      <span className="min-w-0 flex-1 text-base text-ink2 [overflow-wrap:anywhere]">{it.title}</span>
      {it.amountCents > 0 && over > 0 && <span className="text-cap font-semibold text-amber-ink tabular-nums">+{eur(over)} сверх</span>}
      <span className="text-base text-ink2 tabular-nums">{eur(it.spentCents)}</span>
    </>
  )
  return clickable ? (
    <button type="button" onClick={() => onOpen(it)} className={row}>
      {body}
    </button>
  ) : (
    <div className={row}>{body}</div>
  )
}
