import { useState, type ReactNode } from 'react'
import { CalendarClock, CalendarRange, ChevronRight, Hourglass, Landmark, NotebookPen, Pencil, PiggyBank, Repeat, Trash2 } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import { useAddAction, useOpenAdd } from '@/app/addSheetContext'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { Swipeable } from '@/components/ui/Swipeable'
import { WeekSwitcher } from '@/components/ui/WeekSwitcher'
import { CalendarLink } from '@/components/layout/CalendarLink'
import { MoreList, SectionHeader, type MoreLink } from '@/components/layout/MoreList'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { addDaysISO, formatDayMonth, formatRelativeDay, todayBerlin, weekStart } from '@/lib/dates'
import { formatAmount, formatEstimate, formatEur, plural, toCents } from '@/lib/format'
import { accountsStart, groupBalanceAt } from '@/lib/rules/accounts'
import { currentPeriodMonth } from '@/lib/rules/periods'
import { planPeriods } from '@/lib/rules/planPeriods'
import { weekPace } from '@/lib/rules/forecast'
import { forecastEnd, plannedQuestions, weekSpendings } from '@/lib/rules/money'
import { nextOccurrence, ruleState } from '@/lib/rules/recurringEdit'
import { NotesSection } from '@/features/notes/NotesCard'
import { useAccountName, useAccounts, useAddExpense, useAllTransactions, useAllWeekLimits, useDeleteTransaction, usePaydays, usePlanTransactions, usePlannedItems, useRecurring, useWeekLimits, type Transaction } from './api'
import { CutNextWeek } from './CutNextWeek'
import { AccountsTab } from './AccountsTab'
import { EnvelopesTab } from './EnvelopesTab'
import { FreeUntilHero } from './FreeUntil'
import { LimitsSheet } from './LimitsSheet'
import { MoneyQuestions } from './MoneyQuestions'
import { MoneyTotal } from './MoneyTotal'
import { MonthTab } from './MonthTab'
import { PlanTab } from './PlanTab'
import { RecurringTab } from './RecurringTab'
import { WishlistTab } from './WishlistTab'
import { useMoneyWeek } from './useMoneyWeek'

const BACK = '/money'
const SECTIONS = {
  plan: 'План',
  accounts: 'Счета',
  month: 'Месяц',
  recurring: 'Регулярные',
  envelopes: 'Конверты и долги',
  wishes: 'Хотелки',
  notes: 'Заметки',
} as const
type Section = keyof typeof SECTIONS

const MORE: readonly MoreLink[] = [
  { to: '/money/plan', label: 'План', icon: CalendarClock, hint: 'по периодам' },
  { to: '/money/accounts', label: 'Счета', icon: Landmark },
  { to: '/money/month', label: 'Месяц', icon: CalendarRange, hint: 'план и баланс' },
  { to: '/money/recurring', label: 'Регулярные', icon: Repeat },
  { to: '/money/envelopes', label: 'Конверты и долги', icon: PiggyBank },
  { to: '/money/wishes', label: 'Хотелки', icon: Hourglass },
  { to: '/money/notes', label: 'Заметки', icon: NotebookPen },
]

/**
 * Деньги: «Сейчас» on the main view (docs/money-redesign.md, phase 4) — the questions, one main number («Свободно до
 * …» and how it is counted), the week in one block, what leaves before the day of money, the week's spending; the
 * plan, accounts, month and the rest one tap deeper («Ещё»).
 */
export function MoneyScreen() {
  const section = useParams()['*'] ?? ''
  if (section === '') {
    return (
      <>
        <ScreenHeader title="Деньги" right={<CalendarLink sphere="money" />} />
        {/* the questions themselves — on the week (and «Сегодня»); sections only say that some are waiting */}
        <MoneyQuestions />
        <FreeUntilHero />
        <WeekTab untilPayday={<UntilPayday />} />
        <MoneyMore />
      </>
    )
  }
  if (!(section in SECTIONS)) return <Navigate to={BACK} replace />
  const s = section as Section
  return (
    <>
      <SectionHeader title={SECTIONS[s]} back={BACK} sphere="Деньги" right={s === 'month' ? <CalendarLink sphere="money" /> : undefined} />
      {(s === 'month' || s === 'envelopes' || s === 'plan') && <PendingLink />}
      {s === 'plan' && <PlanTab />}
      {s === 'accounts' && <AccountsTab />}
      {s === 'month' && <MonthTab />}
      {s === 'recurring' && <RecurringTab />}
      {s === 'envelopes' && <EnvelopesTab />}
      {s === 'wishes' && <WishlistTab />}
      {s === 'notes' && <NotesSection sphere="money" />}
    </>
  )
}

/** «Ещё» with the rules' count and the nearest date on «Регулярные» («3 · след. 1.12»). */
function MoneyMore() {
  return <MoreList links={useMoreLinks()} />
}

function useMoreLinks(): readonly MoreLink[] {
  const rules = useRecurring()
  const txs = useAllTransactions()
  const accounts = useAccounts()
  const today = todayBerlin()
  // «Счета» — what «Баланс» holds now, once there is a start by accounts
  const balance = groupBalanceAt(txs.data ?? [], accounts.data ?? [], 'balance', today, 'fact')
  const links = balance === null ? MORE : MORE.map((l) => (l.to === '/money/accounts' ? { ...l, hint: `«Баланс» ${formatEur(balance, { whole: true })}` } : l))
  const current = (rules.data ?? []).filter((r) => ruleState(r, today) !== 'ended')
  if (!current.length) return links
  const end = forecastEnd(today)
  const next = current
    .map((r) => nextOccurrence(r, txs.data ?? [], today, end))
    .filter((d): d is string => d !== null)
    .sort()[0]
  const hint = `${current.length}${next ? ` · след. ${formatDayMonth(next)}` : ''}`
  return links.map((l) => (l.to === '/money/recurring' ? { ...l, hint } : l))
}

function PendingLink() {
  const txs = usePlanTransactions()
  const n = plannedQuestions(txs.data ?? [], todayBerlin()).length
  if (n === 0) return null
  return (
    <Link to={BACK} className="flex min-h-11 items-center gap-2 rounded-xl bg-sub px-4 text-left text-base text-ink no-underline active:bg-line2">
      <span className="size-2 flex-none rounded-full bg-money" />
      <span className="min-w-0 flex-1">
        {plural(n, ['Ждёт', 'Ждут', 'Ждут'])} подтверждения · <span className="font-semibold tabular-nums">{n}</span>
      </span>
      <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
    </Link>
  )
}

function WeekTab({ untilPayday }: { untilPayday: ReactNode }) {
  const today = todayBerlin()
  const thisMonday = weekStart(today)
  const [monday, setMonday] = useState(thisMonday)
  const [editLimits, setEditLimits] = useState(false)
  const { week, txs, summary, pending } = useMoneyWeek(monday)
  const limits = useWeekLimits(week?.id ?? null)
  const openAdd = useOpenAdd()
  useAddAction(() => openAdd('expense'))
  const spendings = weekSpendings(txs, monday)
  const [allSpendings, setAllSpendings] = useState(false)
  const shown = allSpendings ? spendings.list : spendings.list.slice(0, SPENDINGS_SHOWN)
  const switcher = (
    <WeekSwitcher
      label={`${week?.budget_week_no ? `Неделя ${week.budget_week_no} · ` : ''}${formatDayMonth(monday)}–${formatDayMonth(addDaysISO(monday, 6))}`}
      onPrev={() => setMonday(addDaysISO(monday, -7))}
      onNext={() => setMonday(addDaysISO(monday, 7))}
      onReset={monday !== thisMonday ? () => setMonday(thisMonday) : undefined}
      resetLabel="Эта неделя"
    />
  )

  return (
    <>
      {pending ? (
        <SkeletonCard />
      ) : !summary.hasLimits ? (
        <>
          {switcher}
          <EmptyState title="Лимиты недели не заданы">
            <span className="flex flex-col items-start gap-3">
              Задай их — и неделя начнёт считаться.
              <Button variant="secondary" onClick={() => setEditLimits(true)}>
                Задать лимиты
              </Button>
            </span>
          </EmptyState>
        </>
      ) : (
        <>
          {/* the week in one block: the total, the pace, the categories compact (phase 4) */}
          <Card>
            {switcher}
            <MoneyTotal summary={summary} />
            {monday === thisMonday && <WeekPaceLine spentCents={summary.spentCents} limitCents={summary.limitCents} monday={monday} today={today} />}
            <ul className="m-0 flex list-none flex-col gap-2 border-t border-line px-0 pt-3 pb-0">
              {summary.categories
                .filter((c) => c.limitCents > 0 || c.spentCents > 0)
                .map((c) => (
                  <li key={c.category} className="flex flex-col">
                    <div className="flex justify-between gap-3 text-base">
                      <span>{c.category}</span>
                      <span className="tabular-nums">
                        {formatAmount(c.spentCents, { whole: true })}
                        {c.limitCents > 0 && <span className="text-ink2"> из {formatAmount(c.limitCents, { whole: true })}</span>}
                      </span>
                    </div>
                    {/* a category without a limit just shows its sum — «сверх лимита» only where there is one */}
                    {c.limitCents > 0 && c.deviationCents > 0 && <span className="text-cap font-semibold text-amber-ink tabular-nums">+{formatEur(c.deviationCents)} сверх лимита</span>}
                  </li>
                ))}
            </ul>
            <Button variant="quiet" className="h-11 self-start" icon={<Pencil size={16} strokeWidth={1.75} aria-hidden="true" className="text-ink2" />} onClick={() => setEditLimits(true)}>
              Изменить лимиты
            </Button>
          </Card>
          {summary.status === 'over' && monday <= thisMonday && <CutNextWeek monday={monday} summary={summary} />}
        </>
      )}

      {monday === thisMonday && untilPayday}

      <Card>
        <CardHeader title="Траты недели" context={spendings.list.length ? formatEur(spendings.limitCents) : undefined} />
        {spendings.list.length === 0 ? (
          <p className="m-0 text-cap text-ink2">Пока ни одной. Хорошая неделя для кошелька.</p>
        ) : (
          <>
            <ul className="m-0 flex list-none flex-col p-0">
              {shown.map((t) => (
                <li key={t.id} className="border-t border-line first:border-t-0">
                  <SpendingRow t={t} today={today} />
                </li>
              ))}
            </ul>
            {spendings.list.length > SPENDINGS_SHOWN && (
              <Button variant="quiet" className="h-11 self-start" aria-expanded={allSpendings} onClick={() => setAllSpendings(!allSpendings)}>
                {allSpendings ? 'Свернуть' : `Все · ${spendings.list.length}`}
              </Button>
            )}
          </>
        )}
      </Card>

      <LimitsSheet open={editLimits} onClose={() => setEditLimits(false)} monday={monday} current={limits.data ?? []} />
    </>
  )
}

/** The week's spending shows the latest few; «Все · N» opens the rest. */
const SPENDINGS_SHOWN = 5

/**
 * «До дня денег» (phase 4): what is still to leave before the next day of money — the open items of today's period
 * (`planPeriods`), recurring ones too; nothing to leave — no block. «весь план» leads to «План».
 */
function UntilPayday() {
  const items = usePlannedItems()
  const txs = usePlanTransactions()
  const accounts = useAccounts()
  const limits = useAllWeekLimits()
  const paydays = usePaydays()
  if (items === null || paydays === null || txs.isPending || accounts.isPending || limits.isPending) return null
  const today = todayBerlin()
  const all = txs.data ?? []
  const [now] = planPeriods({ items, txs: all, accounts: accounts.data ?? [], limits: limits.data ?? [], start: accountsStart(all), today, paydays, currentMonth: currentPeriodMonth(today, paydays), count: 1 })
  const list = [...now!.items, ...now!.recurring].sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9') || a.title.localeCompare(b.title))
  if (!list.length) return null
  return (
    <Card>
      <CardHeader title={`До дня денег · ${formatDayMonth(addDaysISO(now!.end, 1))}`} dotClass="bg-money" />
      <ul className="m-0 flex list-none flex-col p-0">
        {list.map((it) => (
          <li key={it.key} className="flex min-h-11 items-center gap-3 border-t border-line py-2 first:border-t-0">
            <span className="min-w-0 flex-1">
              <span className="block text-base [overflow-wrap:anywhere]">{it.title}</span>
              {it.date && <span className="block text-cap text-ink2">{formatRelativeDay(it.date, today)}</span>}
            </span>
            <span className="text-base tabular-nums">{formatEur(it.leftCents, { whole: true })}</span>
          </li>
        ))}
      </ul>
      <Link to="/money/plan" className="flex min-h-11 items-center gap-1 self-start text-cap text-ink2 no-underline">
        весь план
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </Link>
    </Card>
  )
}

/** «при таком темпе к воскресенью ≈ X € из лимита Y €» — from Wednesday to Saturday; above the limit — amber. */
function WeekPaceLine({ spentCents, limitCents, monday, today }: { spentCents: number; limitCents: number; monday: string; today: string }) {
  const pace = weekPace(spentCents, limitCents, monday, today)
  if (!pace) return null
  const over = pace.projectedCents > pace.limitCents
  return (
    <div className={over ? 'text-cap font-semibold text-amber-ink tabular-nums' : 'text-cap text-ink2 tabular-nums'}>
      при таком темпе к воскресенью ≈ {formatEstimate(pace.projectedCents)} из лимита {formatEur(pace.limitCents, { whole: true })}
    </div>
  )
}

/** A week's expense: own ones (not from Excel) are removed by a swipe left or by a tap → «Удалить»; a toast brings it back. */
function SpendingRow({ t, today }: { t: Transaction; today: string }) {
  const accountName = useAccountName()
  const del = useDeleteTransaction()
  const add = useAddExpense()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const own = t.source_id === null
  const remove = () => {
    del.mutate(t.id)
    toast({
      text: `${t.title} · ${formatEur(toCents(t.amount_eur))} — убрала`,
      actionLabel: 'Вернуть',
      onAction: () => add.mutate({ id: t.id, date: t.date, amount_eur: t.amount_eur, category: t.category, account_id: t.account_id, title: t.title }),
    })
  }
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-base [overflow-wrap:anywhere]">{t.title}</span>
        <span className="block text-cap text-ink2">
          {[formatRelativeDay(t.date, today), t.category !== t.title ? t.category : null, accountName(t), t.envelope_id ? 'конверт' : null].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="text-base tabular-nums">{formatEur(toCents(t.amount_eur))}</span>
    </>
  )
  if (!own) return <div className="flex min-h-11 items-center gap-3 py-2">{body}</div>
  return (
    <Swipeable onLeft={remove} leftLabel="Удалить" leftIcon={Trash2}>
      <div className="flex items-center gap-2 bg-card">
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2 text-left">
          {body}
        </button>
        {open && (
          <Button variant="secondary" className="h-11 flex-none" icon={<Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />} onClick={remove}>
            Удалить
          </Button>
        )}
      </div>
    </Swipeable>
  )
}
