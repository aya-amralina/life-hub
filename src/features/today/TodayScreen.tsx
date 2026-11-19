import { useState } from 'react'
import { CircleCheck, Flame, Settings } from 'lucide-react'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn } from '@/components/ui/cn'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { CalendarLink } from '@/components/layout/CalendarLink'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import {
  formatDayMonth,
  formatLongDate,
  formatTimeBerlin,
  hourBerlin,
  parseISODate,
  todayBerlin,
  weekStart,
  weekdayShort,
  type ISODate,
} from '@/lib/dates'
import { burning, completedOn, itemsOfDay, nextTargetAfterHorizon } from '@/lib/rules/items'
import { isEvening, spentOn } from '@/lib/rules/day'
import { formatEur } from '@/lib/format'
import { EveningCard } from '@/features/body/EveningCard'
import { HabitsCard } from '@/features/body/HabitsCard'
import { useItems, useUpdateItem } from '@/features/items/api'
import { donePatch, reopenPatch } from '@/features/items/donePatch'
import { ItemRow } from '@/features/items/ItemRow'
import { useWeekTransactions } from '@/features/money/api'
import { FreeUntilRow } from '@/features/money/FreeUntil'
import { ReviewCard } from '@/features/review/ReviewCard'
import { InstallHint } from '@/features/settings/InstallHint'
import { QuestionStack } from './QuestionStack'
import { useWeek } from '@/features/weeks/api'

export function TodayScreen() {
  const today = todayBerlin()
  const week = useWeek(weekStart(today))
  const weekday = format(parseISODate(today), 'EEEE', { locale: ru })
  const place = week.data?.place_mode?.trim()
  const evening = isEvening(hourBerlin())

  return (
    <>
      <ScreenHeader
        eyebrow={[weekday.charAt(0).toUpperCase() + weekday.slice(1), place].filter(Boolean).join(' · ')}
        title={formatLongDate(today)}
        right={
          <div className="flex gap-2">
            <CalendarLink />
            <Link
              to="/settings"
              aria-label="Настройки"
              className="flex size-11 flex-none items-center justify-center rounded-full bg-sub text-ink active:bg-line2"
            >
              <Settings size={20} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </div>
        }
      />
      <InstallHint compact />
      <ReviewCard today={today} />
      {/* Questions stand first until answered (design 3m). */}
      <QuestionStack />
      {/* one quiet row, no card: the day stays the day */}
      <FreeUntilRow to="/money" />
      {/* by the time of day: from 18:00 «Вечер» moves up, with what the day came to */}
      {evening && <EveningCard date={today} context={<DaySummary today={today} />} />}
      <HabitsCard date={today} to="/body" />
      <BurningCard today={today} />
      {!evening && <EveningCard date={today} foldable />}
    </>
  )
}

/** «сделано 3 · потрачено 4,20 €» — the day in one line, in the header of «Вечер». */
function DaySummary({ today }: { today: ISODate }) {
  const items = useItems()
  const txs = useWeekTransactions(weekStart(today))
  const done = completedOn(items.data ?? [], today).length
  const spent = spentOn(txs.data ?? [], today)
  if (done === 0 && spent === 0) return null
  return <>{[done > 0 ? `сделано ${done}` : null, spent > 0 ? `потрачено ${formatEur(spent)}` : null].filter(Boolean).join(' · ')}</>
}

function BurningCard({ today }: { today: ISODate }) {
  const items = useItems()
  const update = useUpdateItem()
  const [doneOpen, setDoneOpen] = useState(false)

  if (items.isPending) return <SkeletonCard />
  if (items.isError) return <EmptyState title="Не удалось загрузить">Проверь сеть — данные подтянутся сами.</EmptyState>

  const dayItems = itemsOfDay(items.data, today)
  const hot = burning(items.data, today).filter((b) => !dayItems.includes(b.item))
  const doneToday = completedOn(items.data, today)

  if (hot.length === 0 && dayItems.length === 0 && doneToday.length === 0) {
    const next = nextTargetAfterHorizon(items.data, today)
    return (
      <EmptyState title="Ничего не горит">
        {next
          ? `Ближайший срок — ${weekdayShort(next).toLowerCase()}, ${formatDayMonth(next)}. Можно спокойно заняться своим.`
          : 'Сроков впереди нет. Можно спокойно заняться своим.'}
      </EmptyState>
    )
  }

  const open = dayItems.length + hot.length
  return (
    <Card>
      <CardHeader
        title="Горит"
        icon={<Flame size={20} strokeWidth={1.75} aria-hidden="true" className="text-ink2" />}
        context={open > 0 ? `${open} · на 3 дня вперёд` : 'всё сделано'}
      />
      {open > 0 && (
        <div className="flex flex-col gap-2">
          {dayItems.map((item) => (
            <ItemRow key={item.id} item={item} today={today} onToggle={() => update.mutate({ id: item.id, patch: donePatch(item.sphere) })} />
          ))}
          {hot.map(({ item }) => (
            <ItemRow key={item.id} item={item} today={today} onToggle={() => update.mutate({ id: item.id, patch: donePatch(item.sphere) })} />
          ))}
        </div>
      )}
      {/* done today folds away under «Сделано» (closed by default), so the card shows what is still burning */}
      {doneToday.length > 0 && (
        <div className={cn('flex flex-col', open > 0 && 'border-t border-line pt-2')}>
          <GroupHeader
            mark={<CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink2" />}
            title="Сделано"
            count={doneToday.length}
            summary={doneOpen ? undefined : 'показать'}
            open={doneOpen}
            onToggle={() => setDoneOpen(!doneOpen)}
          />
          <div
            inert={!doneOpen}
            className={cn('grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none', doneOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
          >
            <div className="-mx-1 min-h-0 overflow-hidden">
              <div className="flex flex-col gap-2 px-1 pt-2 pb-1">
                {doneToday.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    today={today}
                    meta={`готово в ${formatTimeBerlin(item.done_at!)}`}
                    onToggle={() => update.mutate({ id: item.id, patch: reopenPatch(item.status === 'Erledigt' || item.status === 'Готово' || item.status === 'готово' ? null : item.status, item.sphere) })}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
