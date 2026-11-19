import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { useAddAction } from '@/app/addSheetContext'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { FilterChips } from '@/components/ui/FilterChips'
import { WeekSwitcher } from '@/components/ui/WeekSwitcher'
import { cn } from '@/components/ui/cn'
import { formatDayMonth, parseISODate, todayBerlin, type ISODate } from '@/lib/dates'
import { formatEur, toCents } from '@/lib/format'
import { BALANCE_LINE_POINTS, balanceLine, niceTicks } from '@/lib/rules/charts'
import { balanceView, reconcileAccounts } from '@/lib/rules/accounts'
import { XYChart } from '@/components/charts/Chart'
import { ChartLegend } from '@/components/charts/chartParts'
import { balancesByDate, forecastEnd, isFact, isWeekRow, monthsTable, plannedQuestions, reconcile, signedCents, upcomingPlanned } from '@/lib/rules/money'
import { confirmPatch } from '@/lib/rules/operation'
import { ACCOUNTS } from '@/lib/constants'
import { Chip } from '@/components/ui/Chip'
import { MetaChip } from '@/components/ui/MetaChip'
import { ruleState } from '@/lib/rules/recurringEdit'
import { joinRu } from '@/lib/format'
import { accountsCheckText, potCheckText, shortName } from './checkText'
import { useAccountName, useAccounts, useActualBalances, useAnswerPlanned, usePlanTransactions, useRecurring, type PlanTx } from './api'
import { OperationSheet } from './OperationSheet'

type Filter = 'plan' | 'fact'

const monthName = (ym: string) => format(parseISODate(`${ym}-01`), 'LLLL yyyy', { locale: ru })
const shiftMonth = (ym: string, n: number) => {
  const d = parseISODate(`${ym}-01`)
  d.setMonth(d.getMonth() + n)
  return format(d, 'yyyy-MM')
}
const signed = (t: PlanTx) => {
  const c = signedCents(t)
  return c > 0 ? `+${formatEur(c, { whole: true })}` : c < 0 ? `−${formatEur(-c, { whole: true })}` : formatEur(toCents(t.amount_eur), { whole: true })
}

/** Месяц: balance now and the plan to the rolling horizon (rule 1), operations plan/fact, what comes next, months table. */
export function MonthTab() {
  const today = todayBerlin()
  const txs = usePlanTransactions()
  const answer = useAnswerPlanned()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [filter, setFilter] = useState<Filter[]>([])
  const [showRemoved, setShowRemoved] = useState(false)
  const actual = useActualBalances()
  const rules = useRecurring()
  const accounts = useAccounts()
  // the operation sheet: null — closed, 'new' — a new operation, else the one being edited
  const [editing, setEditing] = useState<PlanTx | 'new' | null>(null)
  useAddAction(() => setEditing('new'))

  if (txs.isPending) return <SkeletonCard />
  const all = txs.data ?? []
  if (!all.length) {
    return (
      <>
        <EmptyState title="Операций пока нет">
          <span className="flex flex-col items-start gap-3">
            Заведи первую через «+» — ожидаемый доход, аренду, поездку. Траты появятся здесь сами.
            <Button variant="secondary" onClick={() => setEditing('new')}>
              Новая операция
            </Button>
          </span>
        </EmptyState>
        <OperationSheet open={editing !== null} onClose={() => setEditing(null)} tx={null} />
      </>
    )
  }

  // «сейчас» = start + operations with status «факт»; planned ones with a past date only wait for an answer.
  // From the start by accounts (decision 18.11.2026) it is the group «Баланс»; before it — the common pot.
  const accountList = accounts.data ?? []
  const view = balanceView(all, accountList, today)
  const factNow = view.at(today, 'fact')
  const end = forecastEnd(today)
  const planEnd = view.at(end, 'plan')
  const balanceNames = accountList.filter((a) => a.grp === 'balance' && !a.archived).map((a) => shortName(a.name))
  const pending = plannedQuestions(all, today)
  const pendingCents = pending.reduce((s, q) => s + signedCents(q.tx), 0)
  // real balances against the calculation on that day: by account from the start, before it the old rows («Revolut» …)
  const byAccount = view.start ? reconcileAccounts(actual.data ?? [], all, accountList) : null
  const check = view.start ? null : reconcile(balancesByDate((actual.data ?? []).filter((r) => !r.account_id)), all, ACCOUNTS)
  const inMonth = all.filter((t) => t.date.startsWith(month) && t.kind !== 'opening')
  const removed = inMonth.filter((t) => t.cancelled_at)
  const ops = inMonth
    .filter((t) => showRemoved || !t.cancelled_at)
    .filter((t) => (filter[0] === 'plan' ? !isFact(t) && !t.cancelled_at : filter[0] === 'fact' ? isFact(t) : true))
    .sort((a, b) => b.date.localeCompare(a.date))
  const next = upcomingPlanned(all, today).slice(0, 5)
  // the chart: from the start of this month (or of the accounts, if later — no jump inside the line) to the horizon
  const monthStart = `${today.slice(0, 7)}-01`
  const line = balanceLine(all, view.start && view.start > monthStart ? view.start : monthStart, end, today, BALANCE_LINE_POINTS, view.at)
  const months = monthsTable(all, today, end, view)
  const accountsFrom = months.find((m) => m.accountsFrom)?.accountsFrom ?? null
  const ruleCount = (rules.data ?? []).filter((r) => ruleState(r, today) !== 'ended').length

  return (
    <>
      <Card>
        <CardHeader title={`Баланс до ${formatDayMonth(end)}`} dotClass="bg-money" />
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-big font-semibold">{formatEur(factNow, { whole: true })}</span>
          <span className="text-base text-ink2">сейчас</span>
        </div>
        <div className="text-cap text-ink2">
          {view.start ? `«Баланс»: ${balanceNames.join(', ')} · счета с ${formatDayMonth(view.start)}` : 'старт и операции со статусом «факт»'}
        </div>
        {pending.length > 0 && (
          <p className="m-0 text-cap font-semibold text-ink tabular-nums">
            {`Ждут подтверждения: ${joinRu(pending.slice(0, 3).map((q) => q.tx.title))}${pending.length > 3 ? ` и ещё ${pending.length - 3}` : ''} · ${pendingCents > 0 ? '+' : '−'}${formatEur(Math.abs(pendingCents), { whole: true })}`}
          </p>
        )}
        <div className="text-base text-ink2 tabular-nums">план на {formatDayMonth(end)} — {formatEur(planEnd, { whole: true })}</div>
        <XYChart
          label={`Баланс до ${formatDayMonth(end)}: план и факт`}
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
        <p className="m-0 text-cap text-ink2 tabular-nums">{view.start ? accountsCheckText(byAccount) : potCheckText(check)}</p>
      </Card>

      {next.length > 0 && (
        <Card>
          <CardHeader title="Дальше по плану" />
          <ul className="m-0 flex list-none flex-col p-0">
            {next.map((t) => (
              <li key={t.id} className="flex min-h-11 items-center gap-3 border-t border-line text-base first:border-t-0">
                <span className="w-10 flex-none text-cap text-ink2 tabular-nums">{formatDayMonth(t.date)}</span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
                  <span lang="de" className="min-w-0 [overflow-wrap:anywhere]">
                    {t.title}
                  </span>
                  {t.recurring_id && <MetaChip kind="repeat" text="регулярный" />}
                </span>
                <span className="tabular-nums">{signed(t)}</span>
              </li>
            ))}
          </ul>
          <Link to="/money/recurring" className="-mb-2 flex min-h-11 items-center gap-2 border-t border-line text-base text-ink no-underline active:bg-sub">
            <span className="min-w-0 flex-1">
              {ruleCount ? (
                <>
                  Регулярные <span className="text-ink2 tabular-nums">· {ruleCount}</span>
                </>
              ) : (
                'Завести регулярный платёж'
              )}
            </span>
            <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
          </Link>
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
              <OperationRow key={t.id} t={t} today={today} onOpen={() => setEditing(t)} onConfirm={() => answer(t, confirmPatch(t, null, new Date().toISOString()))} />
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
                  <td className="py-2">
                    {format(parseISODate(`${m.month}-01`), 'LLL', { locale: ru })}
                    {m.accountsFrom && <span className="block text-ink2">с {formatDayMonth(m.accountsFrom)}</span>}
                  </td>
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
          {accountsFrom && <p className="m-0 text-cap text-ink2">С {formatDayMonth(accountsFrom)} доходы, расходы и остаток — только «Баланс».</p>}
        </Card>
      )}
      <OperationSheet open={editing !== null} onClose={() => setEditing(null)} tx={editing === 'new' ? null : editing} />
    </>
  )
}

function OperationRow({ t, today, onConfirm, onOpen }: { t: PlanTx; today: ISODate; onConfirm: () => void; onOpen: () => void }) {
  const accountName = useAccountName()
  const planned = !isFact(t) && !t.cancelled_at
  const muted = Boolean(t.cancelled_at)
  return (
    <li className="flex min-h-12 items-center gap-2 border-t border-line py-1 first:border-t-0">
      {/* the row opens the operation: everything about it can be changed there */}
      <button type="button" onClick={onOpen} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left active:bg-sub">
        <span className="w-10 flex-none text-cap text-ink2 tabular-nums">{formatDayMonth(t.date)}</span>
        <span className="min-w-0 flex-1">
          <span lang="de" className={cn('block text-base [overflow-wrap:anywhere]', muted && 'text-ink3 line-through')}>
            {t.title}
          </span>
          <span className="block text-cap text-ink2">
            {[muted ? 'убрано из плана' : t.entry_kind === 'week_budget' ? 'бюджет недели' : t.entry_kind === 'week_total' ? 'итог недели' : planned ? 'план' : 'факт', t.category, accountName(t)].filter(Boolean).join(' · ')}
          </span>
        </span>
        {!muted && <span className="text-base tabular-nums">{signed(t)}</span>}
        {!(planned && !isWeekRow(t) && t.date <= today) && <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />}
      </button>
      {planned && !isWeekRow(t) && t.date <= today && (
        <button type="button" onClick={onConfirm} className="h-11 flex-none rounded-xl border border-line2 px-3 text-cap font-semibold active:bg-sub">
          Подтвердить
        </button>
      )}
    </li>
  )
}
