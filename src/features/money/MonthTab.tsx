import { useState } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { FilterChips } from '@/components/ui/FilterChips'
import { WeekSwitcher } from '@/components/ui/WeekSwitcher'
import { cn } from '@/components/ui/cn'
import { formatDayMonth, parseISODate, todayBerlin, type ISODate } from '@/lib/dates'
import { formatEur, toCents } from '@/lib/format'
import { balanceLine } from '@/lib/rules/charts'
import { XYChart } from '@/components/charts/Chart'
import { ChartLegend } from '@/components/charts/chartParts'
import { BUDGET_END, balanceAt, isFact, monthsTable, plannedQuestions, reconcile, signedCents, upcomingPlanned } from '@/lib/rules/money'
import { ACCOUNTS } from '@/lib/constants'
import { Chip } from '@/components/ui/Chip'
import { useEnteredBalances } from '@/features/review/api'
import { joinRu } from '@/lib/format'
import { useAllTransactions, useUpdateTransaction, type Transaction } from './api'

type Filter = 'plan' | 'fact'

const monthName = (ym: string) => format(parseISODate(`${ym}-01`), 'LLLL yyyy', { locale: ru })
const shiftMonth = (ym: string, n: number) => {
  const d = parseISODate(`${ym}-01`)
  d.setMonth(d.getMonth() + n)
  return format(d, 'yyyy-MM')
}
const signed = (t: Transaction) => {
  const c = signedCents(t)
  return c > 0 ? `+${formatEur(c, { whole: true })}` : c < 0 ? `−${formatEur(-c, { whole: true })}` : formatEur(toCents(t.amount_eur), { whole: true })
}

/** Месяц: balance now and the plan to 31.12 (rule 1), operations plan/fact, what comes next, months table. */
export function MonthTab() {
  const today = todayBerlin()
  const txs = useAllTransactions()
  const update = useUpdateTransaction()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [filter, setFilter] = useState<Filter[]>([])
  const [showRemoved, setShowRemoved] = useState(false)
  const entered = useEnteredBalances()

  if (txs.isPending) return <SkeletonCard />
  const all = txs.data ?? []
  if (!all.length) {
    return <EmptyState title="Операций пока нет">Они придут из «Статей» бюджета при импорте. Траты через «+» появятся здесь сразу.</EmptyState>
  }

  // «сейчас» = start + operations with status «факт»; planned ones with a past date only wait for an answer
  const factNow = balanceAt(all, today, 'fact')
  const planEnd = balanceAt(all, BUDGET_END, 'plan', today)
  const pending = plannedQuestions(all, today)
  const pendingCents = pending.reduce((s, q) => s + signedCents(q.tx), 0)
  // real balances from the Sunday review against the calculated balance on that day
  const check = reconcile(
    (entered.data ?? []).map((r) => ({ date: todayBerlin(new Date(r.updated_at)), balances: (r.balances ?? {}) as Record<string, string> })),
    all,
    ACCOUNTS,
  )
  const inMonth = all.filter((t) => t.date.startsWith(month) && t.kind !== 'opening')
  const removed = inMonth.filter((t) => t.cancelled_at)
  const ops = inMonth
    .filter((t) => showRemoved || !t.cancelled_at)
    .filter((t) => (filter[0] === 'plan' ? !isFact(t) && !t.cancelled_at : filter[0] === 'fact' ? isFact(t) : true))
    .sort((a, b) => b.date.localeCompare(a.date))
  const next = upcomingPlanned(all, today).slice(0, 5)
  // two months on the chart: from the start of this month (from 1.11 once December has come)
  const lineFrom = today.slice(0, 7) >= '2026-12' ? '2026-11-01' : `${today.slice(0, 7)}-01`
  const line = balanceLine(all, lineFrom, BUDGET_END, today)
  const months = monthsTable(all, today)

  return (
    <>
      <Card>
        <CardHeader title="Баланс до 31.12" dotClass="bg-money" />
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-big font-semibold">{formatEur(factNow, { whole: true })}</span>
          <span className="text-base text-ink2">сейчас</span>
        </div>
        <div className="text-cap text-ink2">старт и операции со статусом «факт»</div>
        {pending.length > 0 && (
          <p className="m-0 text-cap font-semibold text-ink tabular-nums">
            {`Ждут подтверждения: ${joinRu(pending.slice(0, 3).map((q) => q.tx.title))}${pending.length > 3 ? ` и ещё ${pending.length - 3}` : ''} · ${pendingCents > 0 ? '+' : '−'}${formatEur(Math.abs(pendingCents), { whole: true })}`}
          </p>
        )}
        <div className="text-base text-ink2 tabular-nums">план на 31.12 — {formatEur(planEnd, { whole: true })}</div>
        <XYChart
          label="Баланс до 31.12: план и факт"
          data={line}
          height={184}
          empty={all.filter((t) => isFact(t)).length < 2}
          emptyText="Мало данных — график появится через неделю отметок"
          lines={[
            { key: 'plan', name: 'План', color: 'money', dash: true, unit: ' €' },
            { key: 'fact', name: 'Факт', color: 'money', unit: ' €' },
          ]}
          yLeft={{ domain: ['auto', 'auto'], ticks: niceTicks(line.map((p) => p.plan).concat(line.map((p) => p.fact ?? p.plan))) }}
          todayKey={today}
        />
        <ChartLegend
          items={[
            { name: 'план', color: 'money', kind: 'dash' },
            { name: 'факт', color: 'money', kind: 'line' },
          ]}
        />
        <p className="m-0 text-cap text-ink2 tabular-nums">
          {check === null
            ? 'Реальных остатков пока нет — внеси их в воскресном обзоре, сравню с расчётом.'
            : `Остатки на ${formatDayMonth(check.date)}: ${formatEur(check.actualCents, { whole: true })}, по расчёту ${formatEur(check.calculatedCents, { whole: true })} — ${
                check.matches ? 'сходится' : `расхождение ${check.diffCents > 0 ? '+' : '−'}${formatEur(Math.abs(check.diffCents))}`
              }.${check.missing.length ? ` Не внесены: ${check.missing.join(', ')}.` : ''}`}
        </p>
      </Card>

      {next.length > 0 && (
        <Card>
          <CardHeader title="Дальше по плану" />
          <ul className="m-0 flex list-none flex-col p-0">
            {next.map((t) => (
              <li key={t.id} className="flex min-h-11 items-center gap-3 border-t border-line text-base first:border-t-0">
                <span className="w-10 flex-none text-cap text-ink2 tabular-nums">{formatDayMonth(t.date)}</span>
                <span lang="de" className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {t.title}
                </span>
                <span className="tabular-nums">{signed(t)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <WeekSwitcher
        label={monthName(month)}
        onPrev={() => setMonth(shiftMonth(month, -1))}
        onNext={() => setMonth(shiftMonth(month, 1))}
        onReset={month !== today.slice(0, 7) ? () => setMonth(today.slice(0, 7)) : undefined}
        resetLabel="Этот месяц"
      />
      <FilterChips
        label="Операции"
        options={[
          { value: 'plan', label: 'План' },
          { value: 'fact', label: 'Факт' },
        ]}
        selected={filter}
        onChange={(v) => setFilter(v as Filter[])}
      />
      {removed.length > 0 && (
        <Chip selected={showRemoved} onClick={() => setShowRemoved(!showRemoved)} className="self-start">
          Показать убранные · {removed.length}
        </Chip>
      )}
      <Card>
        <CardHeader title="Операции" context={`${ops.length}`} />
        {ops.length === 0 ? (
          <p className="m-0 text-cap text-ink2">В этом месяце ничего.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {ops.map((t) => (
              <OperationRow key={t.id} t={t} today={today} onConfirm={() => update.mutate({ id: t.id, patch: { confirmed_at: new Date().toISOString() } })} />
            ))}
          </ul>
        )}
      </Card>

      {months.length > 0 && (
        <Card>
          <CardHeader title="Месяцы" />
          <table className="w-full border-collapse text-cap tabular-nums">
            <thead>
              <tr className="text-ink2">
                <th className="py-1 text-left font-normal">Месяц</th>
                <th className="py-1 text-right font-normal">Доход</th>
                <th className="py-1 text-right font-normal">Расход</th>
                <th className="py-1 text-right font-normal">На конец</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-t border-line">
                  <td className="py-2">{format(parseISODate(`${m.month}-01`), 'LLL', { locale: ru })}</td>
                  <td className="py-2 text-right">{formatEur(m.incomeCents, { whole: true })}</td>
                  <td className="py-2 text-right">{formatEur(m.expenseCents, { whole: true })}</td>
                  <td className="py-2 text-right font-semibold">
                    {formatEur(m.endCents, { whole: true })}
                    {m.hasPlan && <span className="block font-normal text-ink2">с планом</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}

/** 3 round ticks over the values (1000 / 2000 / 3000 style). */
function niceTicks(values: number[]): number[] | undefined {
  if (!values.length) return undefined
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const step = Math.max(100, Math.pow(10, Math.floor(Math.log10(Math.max(1, hi - lo)))))
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const n = Math.max(1, Math.round((end - start) / step / 2))
  const ticks: number[] = []
  for (let v = start; v <= end; v += step * n) ticks.push(v)
  return ticks
}

function OperationRow({ t, today, onConfirm }: { t: Transaction; today: ISODate; onConfirm: () => void }) {
  const planned = !isFact(t) && !t.cancelled_at
  const muted = Boolean(t.cancelled_at)
  return (
    <li className="flex min-h-12 items-center gap-3 border-t border-line py-1 first:border-t-0">
      <span className="w-10 flex-none text-cap text-ink2 tabular-nums">{formatDayMonth(t.date)}</span>
      <span className="min-w-0 flex-1">
        <span lang="de" className={cn('block text-base [overflow-wrap:anywhere]', muted && 'text-ink3 line-through')}>
          {t.title}
        </span>
        <span className="block text-cap text-ink2">
          {[muted ? 'убрано из плана' : t.week_budget && planned ? 'бюджет недели' : planned ? 'план' : 'факт', t.category, t.account].filter(Boolean).join(' · ')}
        </span>
      </span>
      {!muted && <span className="text-base tabular-nums">{signed(t)}</span>}
      {planned && !t.week_budget && t.date <= today && (
        <button type="button" onClick={onConfirm} className="h-11 flex-none rounded-xl border border-line2 px-3 text-cap font-semibold active:bg-sub">
          Подтвердить
        </button>
      )}
    </li>
  )
}
