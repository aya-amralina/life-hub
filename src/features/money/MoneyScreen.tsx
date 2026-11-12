import { useState } from 'react'
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useOpenAdd } from '@/app/addSheetContext'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Swipeable } from '@/components/ui/Swipeable'
import { WeekSwitcher } from '@/components/ui/WeekSwitcher'
import { CalendarLink } from '@/components/layout/CalendarLink'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { addDaysISO, formatDayMonth, formatRelativeDay, todayBerlin, weekStart } from '@/lib/dates'
import { formatAmount, formatEur, plural, toCents } from '@/lib/format'
import { plannedQuestions, weekSpendings } from '@/lib/rules/money'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { NotesCard } from '@/features/notes/NotesCard'
import { useAddExpense, useAllTransactions, useDeleteTransaction, useWeekLimits, type Transaction } from './api'
import { CutNextWeek } from './CutNextWeek'
import { EnvelopesTab } from './EnvelopesTab'
import { LimitsSheet } from './LimitsSheet'
import { MoneyQuestions } from './MoneyQuestions'
import { MoneyTotal } from './MoneyTotal'
import { MonthTab } from './MonthTab'
import { WishlistTab } from './WishlistTab'
import { useMoneyWeek } from './useMoneyWeek'

const TABS = [
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'envelopes', label: 'Конверты' },
  { value: 'wishes', label: 'Хотелки' },
] as const
type Tab = (typeof TABS)[number]['value']

export function MoneyScreen() {
  const [tab, setTab] = useState<Tab>('week')
  return (
    <>
      <ScreenHeader title="Деньги" right={<CalendarLink sphere="money" />} />
      <SegmentedTabs label="Раздел" segments={TABS} value={tab} onChange={setTab} />
      {/* the questions themselves — on «Неделя» (and «Сегодня»); other tabs only say that some are waiting */}
      {tab === 'week' ? <MoneyQuestions /> : <PendingLink onOpen={() => (setTab('week'), window.scrollTo({ top: 0 }))} />}
      {tab === 'week' && <WeekTab />}
      {tab === 'month' && <MonthTab />}
      {tab === 'envelopes' && <EnvelopesTab />}
      {tab === 'wishes' && <WishlistTab />}
      {/* Pinned «Правила» and other money notes. */}
      <NotesCard sphere="money" />
    </>
  )
}

function PendingLink({ onOpen }: { onOpen: () => void }) {
  const txs = useAllTransactions()
  const n = plannedQuestions(txs.data ?? [], todayBerlin()).length
  if (n === 0) return null
  return (
    <button type="button" onClick={onOpen} className="flex min-h-11 items-center gap-2 rounded-xl bg-sub px-4 text-left text-base active:bg-line2">
      <span className="size-2 flex-none rounded-full bg-money" />
      <span className="min-w-0 flex-1">
        {plural(n, ['Ждёт', 'Ждут', 'Ждут'])} подтверждения · <span className="font-semibold tabular-nums">{n}</span>
      </span>
      <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
    </button>
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
            После импорта они придут из Excel. Можно задать и сейчас.
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

      {monday === thisMonday && (
        <Button variant="secondary" icon={<Plus size={20} strokeWidth={1.75} className="text-money" aria-hidden="true" />} onClick={() => openAdd('expense')}>
          Трата
        </Button>
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
            <p className="m-0 text-cap text-ink2">Только то, что идёт в лимит недели. Свою трату убирает свайп влево или тап по строке.</p>
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
