import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useOpenAdd } from '@/app/addSheetContext'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { WeekSwitcher } from '@/components/ui/WeekSwitcher'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { addDaysISO, formatDayMonth, formatRelativeDay, todayBerlin, weekStart } from '@/lib/dates'
import { formatAmount, formatEur, toCents } from '@/lib/format'
import { NotesCard } from '@/features/notes/NotesCard'
import { useDeleteTransaction, useWeekLimits } from './api'
import { LimitsSheet } from './LimitsSheet'
import { MoneyTotal } from './MoneyTotal'
import { useMoneyWeek } from './useMoneyWeek'

export function MoneyScreen() {
  const today = todayBerlin()
  const thisMonday = weekStart(today)
  const [monday, setMonday] = useState(thisMonday)
  const [editLimits, setEditLimits] = useState(false)
  const { week, txs, summary, pending } = useMoneyWeek(monday)
  const limits = useWeekLimits(week?.id ?? null)
  const del = useDeleteTransaction()
  const openAdd = useOpenAdd()
  const expenses = txs.filter((t) => t.kind === 'expense')

  return (
    <>
      <ScreenHeader title="Деньги" eyebrow={week?.budget_week_no ? `Неделя ${week.budget_week_no} бюджета` : undefined} />
      <WeekSwitcher
        label={`${formatDayMonth(monday)}–${formatDayMonth(addDaysISO(monday, 6))}`}
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
            <Button variant="quiet" className="-ml-3 self-start" onClick={() => setEditLimits(true)}>
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
        <CardHeader title="Траты недели" context={expenses.length ? formatEur(expenses.reduce((s, t) => s + toCents(t.amount_eur), 0)) : undefined} />
        {expenses.length === 0 ? (
          <p className="m-0 text-cap text-ink2">Пока ни одной. Хорошая неделя для кошелька.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {expenses.map((t) => (
              <li key={t.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <div className="text-base [overflow-wrap:anywhere]">{t.title}</div>
                  <div className="text-cap text-ink2">
                    {[formatRelativeDay(t.date, today), t.category !== t.title ? t.category : null, t.account, t.envelope_id ? 'конверт' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <span className="text-base tabular-nums">{formatEur(toCents(t.amount_eur))}</span>
                {t.source_id === null && (
                  <IconButton shape="square" label={`Удалить трату ${t.title}`} onClick={() => del.mutate(t.id)} className="border-transparent text-ink3">
                    <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <NotesCard sphere="money" />
      <LimitsSheet open={editLimits} onClose={() => setEditLimits(false)} monday={monday} current={limits.data ?? []} />
    </>
  )
}
