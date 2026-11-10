import { useState } from 'react'
import { ArrowRightLeft, TriangleAlert } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { CheckItem, OverdueTag } from '@/components/ui/CheckItem'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { WeekSwitcher } from '@/components/ui/WeekSwitcher'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { addDaysISO, formatDayMonth, todayBerlin, weekStart, weekdayShort } from '@/lib/dates'
import { formatHours } from '@/lib/format'
import { isItemOpen } from '@/lib/rules/items'
import { NotesCard } from '@/features/notes/NotesCard'
import { useToggleItem, type Item } from '@/features/items/api'
import { StudyHours } from './StudyHours'
import { useStudyWeek } from './useStudyWeek'

export function StudyScreen() {
  const today = todayBerlin()
  const thisMonday = weekStart(today)
  const [monday, setMonday] = useState(thisMonday)
  const { week, items, load, done, itemsDone, pending } = useStudyWeek(monday)
  const toggle = useToggleItem()

  const subjects = [...new Set(items.map((i) => i.area ?? 'Без предмета'))].sort((a, b) => a.localeCompare(b, 'de'))

  return (
    <>
      <ScreenHeader title="Учёба" eyebrow={week?.study_week ? `${week.study_week}${week.place_mode ? ` · ${week.place_mode}` : ''}` : undefined} />
      <WeekSwitcher
        label={`${formatDayMonth(monday)}–${formatDayMonth(addDaysISO(monday, 6))}`}
        onPrev={() => setMonday(addDaysISO(monday, -7))}
        onNext={() => setMonday(addDaysISO(monday, 7))}
        onReset={monday !== thisMonday ? () => setMonday(thisMonday) : undefined}
        resetLabel="Эта неделя"
      />
      {pending ? (
        <SkeletonCard />
      ) : items.length === 0 ? (
        <EmptyState title="На эту неделю пунктов нет">План по неделям придёт из Excel на этапе импорта. Свои пункты можно добавить через «+».</EmptyState>
      ) : (
        <>
          <Card>
            <CardHeader title="Неделя" dotClass="bg-study" context={week?.study_week ?? undefined} />
            <StudyHours done={done} load={load} itemsDone={itemsDone} itemsTotal={items.length} />
          </Card>
          {subjects.map((subject) => {
            const list = items.filter((i) => (i.area ?? 'Без предмета') === subject)
            const hours = list.reduce((s, i) => s + (Number(i.hours_est) || 0), 0)
            return (
              <Card key={subject}>
                <div lang="de">
                  <CardHeader title={subject} dotClass="bg-study" context={hours ? formatHours(hours) : undefined} />
                </div>
                <div className="flex flex-col gap-2">
                  {list.map((i) => (
                    <StudyRow key={i.id} item={i} today={today} onToggle={() => toggle.mutate({ id: i.id, done: isItemOpen(i) })} />
                  ))}
                </div>
              </Card>
            )
          })}
        </>
      )}
      <NotesCard sphere="study" />
    </>
  )
}

function StudyRow({ item, today, onToggle }: { item: Item; today: string; onToggle: () => void }) {
  const open = isItemOpen(item)
  const overdue = open && item.due_date !== null && item.due_date < today
  const day = (d: string) => `${weekdayShort(d).toLowerCase()} ${formatDayMonth(d)}`
  return (
    <CheckItem
      title={item.title}
      lang="de"
      checked={!open}
      onToggle={onToggle}
      meta={
        <>
          {item.type && <span>{item.type}</span>}
          {item.hours_est ? <span className="tabular-nums">{formatHours(Number(item.hours_est))}</span> : null}
          {overdue ? (
            <OverdueTag>{`Срок прошёл · ${day(item.due_date!)}`}</OverdueTag>
          ) : (
            <>
              {item.due_date && <span>срок {item.due_date === today ? 'сегодня' : day(item.due_date)}</span>}
              {open && item.ready_by && item.ready_by !== item.due_date && <span>готово к {day(item.ready_by)}</span>}
            </>
          )}
          {item.synergy && <ArrowRightLeft size={14} strokeWidth={1.75} aria-label={`Связь: ${item.synergy}`} />}
          {item.trap && <TriangleAlert size={14} strokeWidth={1.75} aria-label={`Ловушка: ${item.trap}`} />}
        </>
      }
    />
  )
}
