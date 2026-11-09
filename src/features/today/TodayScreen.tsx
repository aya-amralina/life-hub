import { Flame, MapPin, Settings } from 'lucide-react'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Card, CardHeader } from '@/components/ui/Card'
import { CheckItem, OverdueTag } from '@/components/ui/CheckItem'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { SPHERE_CLASS, SPHERE_LABEL, type Sphere } from '@/lib/constants'
import {
  formatDayMonth,
  formatLongDate,
  formatRelativeDay,
  formatTimeBerlin,
  parseISODate,
  todayBerlin,
  weekdayShort,
} from '@/lib/dates'
import { burning, completedOn, nextTargetAfterHorizon } from '@/lib/rules/items'
import { weekLine } from '@/lib/rules/weeks'
import { useTodayItems, useToggleItem, type Item } from '@/features/items/api'
import { InstallHint } from '@/features/settings/InstallHint'
import { useCurrentWeek } from './api'

export function TodayScreen() {
  const today = todayBerlin()
  const week = useCurrentWeek(today)
  const weekday = format(parseISODate(today), 'EEEE', { locale: ru })
  const line = weekLine(week.data)

  return (
    <>
      <ScreenHeader
        eyebrow={weekday.charAt(0).toUpperCase() + weekday.slice(1)}
        title={formatLongDate(today)}
        right={
          <Link
            to="/settings"
            aria-label="Настройки"
            className="flex size-11 flex-none items-center justify-center rounded-full bg-sub text-ink active:bg-line2"
          >
            <Settings size={20} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        }
      />
      {line && (
        <p className="m-0 flex items-start gap-1 text-cap text-ink2">
          <MapPin size={16} strokeWidth={1.75} aria-hidden="true" className="mt-px flex-none" />
          {line}
        </p>
      )}
      <InstallHint compact />
      <BurningCard today={today} />
    </>
  )
}

function BurningCard({ today }: { today: string }) {
  const items = useTodayItems()
  const toggle = useToggleItem()

  if (items.isPending) return <SkeletonCard />
  if (items.isError) {
    return <EmptyState title="Не удалось загрузить">Проверь сеть — данные подтянутся сами.</EmptyState>
  }

  const hot = burning(items.data, today)
  const doneToday = completedOn(items.data, today)

  if (hot.length === 0 && doneToday.length === 0) {
    const next = nextTargetAfterHorizon(items.data, today)
    return (
      <EmptyState title="Ничего не горит">
        {next
          ? `Ближайший срок — ${weekdayShort(next).toLowerCase()}, ${formatDayMonth(next)}. Можно спокойно заняться своим.`
          : 'Сроков впереди нет. Можно спокойно заняться своим.'}
      </EmptyState>
    )
  }

  return (
    <Card>
      <CardHeader
        title="Горит"
        icon={<Flame size={20} strokeWidth={1.75} aria-hidden="true" className="text-ink2" />}
        context={hot.length > 0 ? `${hot.length}` : 'всё сделано'}
      />
      <div className="flex flex-col gap-2">
        {hot.map(({ item, date, overdue }) => (
          <ItemRow
            key={item.id}
            item={item}
            meta={formatRelativeDay(date, today)}
            overdue={overdue}
            onToggle={() => toggle.mutate({ id: item.id, done: true })}
          />
        ))}
        {doneToday.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            checked
            meta={`готово в ${formatTimeBerlin(item.done_at!)}`}
            onToggle={() => toggle.mutate({ id: item.id, done: false })}
          />
        ))}
      </div>
    </Card>
  )
}

function ItemRow({
  item,
  meta,
  overdue = false,
  checked = false,
  onToggle,
}: {
  item: Item
  meta: string
  overdue?: boolean
  checked?: boolean
  onToggle: () => void
}) {
  const sphere = (item.sphere in SPHERE_LABEL ? item.sphere : 'personal') as Sphere
  const label = SPHERE_LABEL[sphere]
  return (
    <CheckItem
      title={item.title}
      lang={sphere === 'work' ? 'de' : undefined}
      checked={checked}
      dotClass={SPHERE_CLASS[sphere].dot}
      onToggle={onToggle}
      meta={
        overdue && item.due_date ? (
          <>
            <span>{label}</span>
            <OverdueTag>{`Срок прошёл · ${weekdayShort(item.due_date).toLowerCase()} ${formatDayMonth(item.due_date)}`}</OverdueTag>
          </>
        ) : (
          `${label} · ${meta}`
        )
      }
    />
  )
}
