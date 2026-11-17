import { useState } from 'react'
import { CalendarRange, ChevronRight, Hourglass, NotebookPen, Pencil, PiggyBank, Repeat, Trash2 } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import { useAddAction, useOpenAdd } from '@/app/addSheetContext'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Swipeable } from '@/components/ui/Swipeable'
import { WeekSwitcher } from '@/components/ui/WeekSwitcher'
import { CalendarLink } from '@/components/layout/CalendarLink'
import { MoreList, SectionHeader, type MoreLink } from '@/components/layout/MoreList'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { addDaysISO, formatDayMonth, formatRelativeDay, todayBerlin, weekStart } from '@/lib/dates'
import { formatAmount, formatEur, plural, toCents } from '@/lib/format'
import { forecastEnd, plannedQuestions, weekSpendings } from '@/lib/rules/money'
import { nextOccurrence, ruleState } from '@/lib/rules/recurring'
import { NotesSection } from '@/features/notes/NotesCard'
import { useAddExpense, useAllTransactions, useDeleteTransaction, usePlanTransactions, useRecurring, useWeekLimits, type Transaction } from './api'
import { CutNextWeek } from './CutNextWeek'
import { EnvelopesTab } from './EnvelopesTab'
import { LimitsSheet } from './LimitsSheet'
import { MoneyQuestions } from './MoneyQuestions'
import { MoneyTotal } from './MoneyTotal'
import { MonthTab } from './MonthTab'
import { RecurringTab } from './RecurringTab'
import { WishlistTab } from './WishlistTab'
import { useMoneyWeek } from './useMoneyWeek'

const BACK = '/money'
const SECTIONS = {
  month: 'Месяц',
  recurring: 'Регулярные',
  envelopes: 'Конверты и долги',
  wishes: 'Хотелки',
  notes: 'Заметки',
} as const
type Section = keyof typeof SECTIONS

const MORE: readonly MoreLink[] = [
  { to: '/money/month', label: 'Месяц', icon: CalendarRange, hint: 'план и баланс' },
  { to: '/money/recurring', label: 'Регулярные', icon: Repeat },
  { to: '/money/envelopes', label: 'Конверты и долги', icon: PiggyBank },
  { to: '/money/wishes', label: 'Хотелки', icon: Hourglass },
  { to: '/money/notes', label: 'Заметки', icon: NotebookPen },
]

/** Деньги: the week on the main view; month, envelopes, wishes and notes one tap deeper («Ещё»). */
export function MoneyScreen() {
  const section = useParams()['*'] ?? ''
  if (section === '') {
    return (
      <>
        <ScreenHeader title="Деньги" right={<CalendarLink sphere="money" />} />
        {/* the questions themselves — on the week (and «Сегодня»); sections only say that some are waiting */}
        <MoneyQuestions />
        <WeekTab />
        <MoneyMore />
      </>
    )
  }
  if (!(section in SECTIONS)) return <Navigate to={BACK} replace />
  const s = section as Section
  return (
    <>
      <SectionHeader title={SECTIONS[s]} back={BACK} sphere="Деньги" right={s === 'month' ? <CalendarLink sphere="money" /> : undefined} />
      {(s === 'month' || s === 'envelopes') && <PendingLink />}
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
  const today = todayBerlin()
  const current = (rules.data ?? []).filter((r) => ruleState(r, today) !== 'ended')
  if (!current.length) return MORE
  const end = forecastEnd(today)
  const next = current
    .map((r) => nextOccurrence(r, txs.data ?? [], today, end))
    .filter((d): d is string => d !== null)
    .sort()[0]
  const hint = `${current.length}${next ? ` · след. ${formatDayMonth(next)}` : ''}`
  return MORE.map((l) => (l.to === '/money/recurring' ? { ...l, hint } : l))
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

function WeekTab() {
  const today = todayBerlin()
  const thisMonday = weekStart(today)
  const [monday, setMonday] = useState(thisMonday)
  const [editLimits, setEditLimits] = useState(false)
  const { week, txs, summary, pending } = useMoneyWeek(monday)
  const limits = useWeekLimits(week?.id ?? null)
  const openAdd = useOpenAdd()
  useAddAction(() => openAdd('expense'))
  const spendings = weekSpendings(txs, monday)

  return (
    <>
      <WeekSwitcher
        label={`${week?.budget_week_no ? `Неделя ${week.budget_week_no} · ` : ''}${formatDayMonth(monday)}–${formatDayMonth(addDaysISO(monday, 6))}`}
        onPrev={() => setMonday(addDaysISO(monday, -7))}
        onNext={() => setMonday(addDaysISO(monday, 7))}
        onReset={monday !== thisMonday ? () => setMonday(thisMonday) : undefined}
        resetLabel="Эта неделя"
      />
      {pending ? (
        <SkeletonCard />
      ) : !summary.hasLimits ? (
        <EmptyState title="Лимиты недели не заданы">
          <span className="flex flex-col items-start gap-3">
            Задай их — и неделя начнёт считаться.
            <Button variant="secondary" onClick={() => setEditLimits(true)}>
              Задать лимиты
            </Button>
          </span>
        </EmptyState>
      ) : (
        <>
          <Card>
            <CardHeader title="Неделя" dotClass="bg-money" context={summary.status === 'over' ? 'перерасход' : 'в лимите'} />
            <MoneyTotal summary={summary} />
          </Card>
          {summary.status === 'over' && monday <= thisMonday && <CutNextWeek monday={monday} summary={summary} />}
          <Card>
            <CardHeader title="Категории" />
            <div className="flex flex-col gap-4">
              {summary.categories
                .filter((c) => c.limitCents > 0 || c.spentCents > 0)
                .map((c) => (
                  <div key={c.category} className="flex flex-col gap-2">
                    <div className="flex justify-between gap-3 text-base">
                      <span>{c.category}</span>
                      <span className="tabular-nums">
                        {formatAmount(c.spentCents, { whole: true })}{' '}
                        <span className="text-ink2">/ {formatEur(c.limitCents, { whole: true })}</span>
                      </span>
                    </div>
                    <ProgressBar value={c.spentCents} max={c.limitCents} fillClass="bg-money" label={c.category} />
                    {c.deviationCents > 0 && (
                      <div className="text-cap font-semibold text-amber-ink tabular-nums">+{formatEur(c.deviationCents)} сверх лимита</div>
                    )}
                  </div>
                ))}
            </div>
            <Button variant="secondary" className="h-11 self-start" icon={<Pencil size={16} strokeWidth={1.75} aria-hidden="true" className="text-ink2" />} onClick={() => setEditLimits(true)}>
              Изменить лимиты
            </Button>
          </Card>
        </>
      )}

      <Card>
        <CardHeader title="Траты недели" context={spendings.list.length ? formatEur(spendings.limitCents) : undefined} />
        {spendings.list.length === 0 ? (
          <p className="m-0 text-cap text-ink2">Пока ни одной. Хорошая неделя для кошелька.</p>
        ) : (
          <>
            <ul className="m-0 flex list-none flex-col p-0">
              {spendings.list.map((t) => (
                <li key={t.id} className="border-t border-line first:border-t-0">
                  <SpendingRow t={t} today={today} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <LimitsSheet open={editLimits} onClose={() => setEditLimits(false)} monday={monday} current={limits.data ?? []} />
    </>
  )
}

/** A week's expense: own ones (not from Excel) are removed by a swipe left or by a tap → «Удалить»; a toast brings it back. */
function SpendingRow({ t, today }: { t: Transaction; today: string }) {
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
      onAction: () => add.mutate({ id: t.id, date: t.date, amount_eur: t.amount_eur, category: t.category, account: t.account, title: t.title }),
    })
  }
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-base [overflow-wrap:anywhere]">{t.title}</span>
        <span className="block text-cap text-ink2">
          {[formatRelativeDay(t.date, today), t.category !== t.title ? t.category : null, t.account, t.envelope_id ? 'конверт' : null].filter(Boolean).join(' · ')}
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
