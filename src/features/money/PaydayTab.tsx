import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { MetaChip } from '@/components/ui/MetaChip'
import { cn } from '@/components/ui/cn'
import { WEEK_CATEGORIES } from '@/lib/constants'
import { addDaysISO, formatDayMonth, formatWeekdayDate, todayBerlin } from '@/lib/dates'
import { formatEur, joinRu, parseEurInput, plural, toCents } from '@/lib/format'
import { confirmPatch, unconfirmPatch } from '@/lib/rules/operation'
import { paydayPlan, splitWeekLimit } from '@/lib/rules/payday'
import { paydayRule, periodName } from '@/lib/rules/periods'
import { isPlannedOperation } from '@/lib/rules/plan'
import { accountsStart } from '@/lib/rules/accounts'
import { useAccounts, useAllWeekLimits, useAnswerPlanned, useDebts, useEnvelopes, usePaydays, usePlanTransactions, useRecurring, useSaveLimits } from './api'
import { useMoneyWeek } from './useMoneyWeek'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'
const eur = (c: number) => formatEur(c, { whole: true })
const signed = (c: number) => (c < 0 ? `−${eur(-c)}` : eur(c))
const amountText = (c: number) => String(c / 100).replace('.', ',')

/**
 * День денег (docs/money-redesign.md, phase 6): the salary came — what it covers in the new period and what is left to
 * live on, the week limit that comes out of it. «Подтвердить» marks the salary as come (amount and day) and sets the
 * limits of the period's weeks after this one, split in the shares of the latest limits (decisions 20.11.2026).
 * Before the day it is a preview: the same numbers, the day can be moved when it came earlier.
 */
export function PaydayTab() {
  const today = todayBerlin()
  const txs = usePlanTransactions()
  const rules = useRecurring()
  const accounts = useAccounts()
  const envelopes = useEnvelopes()
  const debts = useDebts()
  const limits = useAllWeekLimits()
  const paydays = usePaydays()
  if (txs.isPending || rules.isPending || accounts.isPending || envelopes.isPending || debts.isPending || limits.isPending || paydays === null) return <SkeletonCard />
  const all = txs.data ?? []
  const rule = paydayRule(rules.data ?? [], accounts.data ?? [])
  const start = accountsStart(all)
  const salary = rule
    ? all.filter((t) => t.recurring_id === rule.id && t.kind === 'income' && isPlannedOperation(t, start)).sort((a, b) => a.date.localeCompare(b.date))[0]
    : undefined
  if (!rule || !salary) {
    return (
      <EmptyState title="Дня денег пока нет">
        День денег — это зарплата: ежемесячный доход в «Баланс» в «Регулярных». Когда он есть, здесь в этот день будет видно, на что хватает и какой выходит лимит недели.
      </EmptyState>
    )
  }
  // the latest week with limits gives the shares of the categories
  const latest = (limits.data ?? []).filter((l) => l.limitCents > 0).reduce<string | null>((m, l) => (m === null || l.monday > m ? l.monday : m), null)
  return <PaydayForm key={salary.id} salary={salary} latestMonday={latest ?? today} />
}

function PaydayForm({ salary, latestMonday }: { salary: NonNullable<ReturnType<typeof usePlanTransactions>['data']>[number]; latestMonday: string }) {
  const today = todayBerlin()
  const txs = usePlanTransactions()
  const accounts = useAccounts()
  const envelopes = useEnvelopes()
  const debts = useDebts()
  const limits = useAllWeekLimits()
  const paydays = usePaydays() ?? []
  const base = useMoneyWeek(latestMonday)
  const answerPlanned = useAnswerPlanned()
  const saveLimits = useSaveLimits()
  const toast = useToast()
  const navigate = useNavigate()
  const plannedCents = toCents(salary.amount_eur)
  const [amount, setAmount] = useState(amountText(plannedCents))
  const [arrived, setArrived] = useState(salary.date)
  const [weekly, setWeekly] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const income = parseEurInput(amount)
  const incomeCents = income ?? plannedCents
  const p = paydayPlan({
    envelopes: envelopes.data ?? [],
    debts: debts.data ?? [],
    txs: txs.data ?? [],
    accounts: accounts.data ?? [],
    limits: limits.data ?? [],
    today,
    paydays,
    salary,
    incomeCents,
    arrived: arrived || salary.date,
  })
  const weeklyCents = weekly === null ? p.perWeekCents : (parseEurInput(weekly) ?? 0)
  const shares = Object.fromEntries(base.summary.categories.map((c) => [c.category, c.limitCents]))
  const split = weeklyCents > 0 ? splitWeekLimit(weeklyCents, shares) : null
  const name = periodName(p.month, today)
  const titles = (list: { title: string }[]) => joinRu(list.slice(0, 3).map((it) => it.title)) + (list.length > 3 ? ` и ещё ${list.length - 3}` : '')
  const spendItems = p.line.items.filter((it) => it.kind === 'spend' && !p.line.apart.has(it.key))
  const early = salary.date > today && arrived === salary.date
  const valid = income !== null && income > 0 && !!arrived && arrived <= today

  const confirm = async () => {
    if (!valid || busy) return
    setBusy(true)
    const patch = { ...confirmPatch(salary, incomeCents === plannedCents ? null : incomeCents, new Date().toISOString()), date: arrived }
    const undo = answerPlanned(salary, patch, { ...unconfirmPatch({ ...salary, ...patch }), date: salary.date })
    try {
      // limits only when there is something to split; the weeks of the period after this one
      if (split) for (const monday of p.mondays) await saveLimits.mutateAsync({ monday, limits: split })
      toast({
        text: split
          ? `${salary.title} · ${eur(incomeCents)} — пришла. Лимит недели ${eur(weeklyCents)} на ${p.mondays.length} ${plural(p.mondays.length, ['неделю', 'недели', 'недель'])}`
          : `${salary.title} · ${eur(incomeCents)} — пришла`,
        actionLabel: 'Вернуть',
        onAction: undo,
      })
      navigate('/money')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader title={`${name} · с ${formatDayMonth(p.start)}`} dotClass="bg-money" context={p.lifeCents < 0 ? <MetaChip kind="late" text={`не сходится на ${eur(-p.lifeCents)}`} /> : undefined} />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2">
            <span className="text-cap text-ink2">Пришло, €</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Сколько пришло" className={field} />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-cap text-ink2">Когда</span>
            <input type="date" value={arrived} max={today} onChange={(e) => setArrived(e.target.value)} aria-label="Когда пришло" className={field} />
          </label>
        </div>
        {early && <p className="m-0 text-cap text-ink2">Зарплата ждётся {formatWeekdayDate(salary.date)}. Пришла раньше — поставь сегодняшнюю дату.</p>}
        <ul className="m-0 flex list-none flex-col p-0 text-base tabular-nums">
          <Line label={salary.title} lang="de" cents={incomeCents} sign />
          {p.moreIncomeCents > 0 && <Line label="Ещё придёт в периоде" cents={p.moreIncomeCents} sign />}
          <Line label="Осталось с прошлого периода" cents={p.leftoverCents} sign />
          {p.recurringCents > 0 && <Line label={`Регулярные (${p.line.recurring.length})`} cents={-p.recurringCents} />}
          {p.spendCents > 0 && <Line label="Траты периода" hint={titles(spendItems)} cents={-p.spendCents} />}
          {p.toGoalCents > 0 && <Line label="В копилки" cents={-p.toGoalCents} />}
          {p.debtCents > 0 && <Line label="Долги" hint={titles(p.line.items.filter((it) => it.kind === 'debt'))} cents={-p.debtCents} />}
        </ul>
        <div className="flex items-baseline justify-between gap-3 border-t border-line2 pt-3">
          <span className="text-base font-semibold">На жизнь</span>
          <span className={cn('text-title font-semibold tabular-nums', p.lifeCents < 0 && 'text-red')}>{signed(p.lifeCents)}</span>
        </div>
        <p className="m-0 text-cap text-ink2 tabular-nums">
          {p.days} {plural(p.days, ['день', 'дня', 'дней'])} до {formatDayMonth(addDaysISO(p.end, 1))}
          {p.perWeekCents > 0 ? ` · ≈ ${eur(p.perWeekCents)} в неделю` : ''}
        </p>
      </Card>

      <Card>
        <CardHeader title="Лимит недели" context={p.mondays.length ? `с ${formatDayMonth(p.mondays[0]!)} · ${p.mondays.length} ${plural(p.mondays.length, ['неделя', 'недели', 'недель'])}` : undefined} />
        <input
          value={weekly ?? amountText(p.perWeekCents)}
          onChange={(e) => setWeekly(e.target.value)}
          inputMode="decimal"
          aria-label="Лимит недели, €"
          className={field}
        />
        {split ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-cap text-ink2 tabular-nums">
            {WEEK_CATEGORIES.filter((c) => split[c] > 0).map((c) => (
              <li key={c} className="flex justify-between gap-3">
                <span>{c}</span>
                <span>{eur(split[c])}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-cap text-ink2">
            {weeklyCents > 0 ? 'Лимитов по категориям ещё нет — делить не по чему. Задай их на «Сейчас», и в следующий раз разделю так же.' : 'Лимиты недель не меняются.'}
          </p>
        )}
        <p className="m-0 text-cap text-ink2">По категориям — в тех же долях, что сейчас. Уже заданные лимиты этих недель заменятся.</p>
      </Card>

      {p.lifeCents < 0 && <p className="m-0 text-cap text-ink2">{name} не сходится на {eur(-p.lifeCents)}. Перенеси что-нибудь в «Плане» — или подтверди только зарплату: лимиты не изменятся.</p>}
      <Button onClick={confirm} disabled={!valid || busy}>
        {split ? 'Подтвердить: зарплата и лимиты' : 'Подтвердить зарплату'}
      </Button>
      {!valid && arrived > today && <p className="m-0 text-cap text-ink2">Подтвердить можно, когда деньги пришли.</p>}
    </>
  )
}

function Line({ label, lang, hint, cents, sign = false }: { label: string; lang?: string; hint?: string; cents: number; sign?: boolean }) {
  return (
    <li className="flex min-h-11 items-center gap-3 border-t border-line py-2 first:border-t-0">
      <span className="min-w-0 flex-1">
        <span lang={lang} className="block [overflow-wrap:anywhere]">
          {label}
        </span>
        {hint && <span className="block text-cap text-ink2">{hint}</span>}
      </span>
      <span>{sign && cents > 0 ? `+${eur(cents)}` : signed(cents)}</span>
    </li>
  )
}
