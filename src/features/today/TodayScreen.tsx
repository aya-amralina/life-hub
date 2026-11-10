import { CalendarDays, Flame, Hourglass, MapPin, Plus, Settings } from 'lucide-react'
import { Link } from 'react-router'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useOpenAdd } from '@/app/addSheetContext'
import { Button } from '@/components/ui/Button'
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
  weekStart,
  weekdayShort,
  type ISODate,
} from '@/lib/dates'
import { burning, completedOn, nextTargetAfterHorizon } from '@/lib/rules/items'
import { nextTest } from '@/lib/rules/study'
import { nachhaken } from '@/lib/rules/work'
import { EveningCard } from '@/features/body/EveningCard'
import { HabitsCard } from '@/features/body/HabitsCard'
import { useItems, useToggleItem, type Item } from '@/features/items/api'
import { MoneyTotal } from '@/features/money/MoneyTotal'
import { useMoneyWeek } from '@/features/money/useMoneyWeek'
import { InstallHint } from '@/features/settings/InstallHint'
import { StudyHours } from '@/features/study/StudyHours'
import { useStudyWeek } from '@/features/study/useStudyWeek'
import { useWeek, type Week } from '@/features/weeks/api'

export function TodayScreen() {
  const today = todayBerlin()
  const week = useWeek(weekStart(today))
  const weekday = format(parseISODate(today), 'EEEE', { locale: ru })

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
      <WeekLine week={week.data ?? null} />
      <InstallHint compact />
      <HabitsCard date={today} to="/body" />
      <BurningCard today={today} />
      <MoneyCard today={today} />
      <WorkCard today={today} />
      <StudyCard today={today} />
      <EveningCard date={today} />
    </>
  )
}

/** «● Неделя 5 бюджета ● Н04 учёба ● Неделя 1 глоу-апа ⌖ у сестры» — sphere dots as labels. */
function WeekLine({ week }: { week: Week | null }) {
  if (!week) return null
  const parts: { key: string; dot?: string; text: string }[] = []
  if (week.budget_week_no) parts.push({ key: 'b', dot: 'bg-money', text: `Неделя ${week.budget_week_no} бюджета` })
  if (week.study_week) parts.push({ key: 's', dot: 'bg-study', text: `${week.study_week} учёба` })
  if (week.glowup_week_no) parts.push({ key: 'g', dot: 'bg-body', text: `Неделя ${week.glowup_week_no} глоу-апа` })
  if (!parts.length && !week.place_mode) return null
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-cap text-ink2">
      {parts.map((p) => (
        <li key={p.key} className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${p.dot}`} />
          {p.text}
        </li>
      ))}
      {week.place_mode?.trim() && (
        <li className="flex items-center gap-1">
          <MapPin size={16} strokeWidth={1.75} aria-hidden="true" />
          {week.place_mode.trim()}
        </li>
      )}
    </ul>
  )
}

function BurningCard({ today }: { today: ISODate }) {
  const items = useItems()
  const toggle = useToggleItem()

  if (items.isPending) return <SkeletonCard />
  if (items.isError) return <EmptyState title="Не удалось загрузить">Проверь сеть — данные подтянутся сами.</EmptyState>

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
          <ItemRow key={item.id} item={item} meta={formatRelativeDay(date, today)} overdue={overdue} onToggle={() => toggle.mutate({ id: item.id, done: true })} />
        ))}
        {doneToday.map((item) => (
          <ItemRow key={item.id} item={item} checked meta={`готово в ${formatTimeBerlin(item.done_at!)}`} onToggle={() => toggle.mutate({ id: item.id, done: false })} />
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
      lang={sphere === 'work' || sphere === 'study' ? 'de' : undefined}
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

function MoneyCard({ today }: { today: ISODate }) {
  const { week, summary, pending } = useMoneyWeek(weekStart(today))
  const openAdd = useOpenAdd()
  if (pending) return <SkeletonCard />
  return (
    <Card>
      <CardHeader title="Деньги" dotClass="bg-money" context={week?.budget_week_no ? `неделя ${week.budget_week_no}` : undefined} to="/money" />
      {summary.hasLimits ? (
        <MoneyTotal summary={summary} />
      ) : (
        <p className="m-0 text-cap text-ink2">Лимиты недели ещё не заданы.</p>
      )}
      <Button variant="secondary" icon={<Plus size={20} strokeWidth={1.75} className="text-money" aria-hidden="true" />} onClick={() => openAdd('expense')}>
        Трата
      </Button>
    </Card>
  )
}

function WorkCard({ today }: { today: ISODate }) {
  const items = useItems()
  if (items.isPending) return <SkeletonCard />
  const work = (items.data ?? []).filter((i) => i.sphere === 'work')
  const inWork = work.filter((i) => i.status === 'In Arbeit')
  const waiting = nachhaken(work, [], today)
  if (!work.length) return null
  return (
    <Card>
      <CardHeader title="Работа" dotClass="bg-work" context={inWork.length ? `In Arbeit · ${inWork.length}` : undefined} to="/work" />
      {inWork.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {inWork.slice(0, 3).map((i) => (
            <li key={i.id} lang="de" className="text-base [overflow-wrap:anywhere]">
              {i.title}
            </li>
          ))}
          {inWork.length > 3 && <li className="text-cap text-ink2">и ещё {inWork.length - 3}</li>}
        </ul>
      ) : (
        <p className="m-0 text-cap text-ink2">Сейчас ничего не в работе.</p>
      )}
      {waiting.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Bei wem nachhaken">
          <Hourglass size={16} strokeWidth={1.75} aria-hidden="true" className="text-ink2" />
          {waiting.slice(0, 4).map((w) => (
            <span key={w.name} lang="de" className="inline-flex h-8 items-center gap-1 rounded-lg bg-sub px-3 text-cap text-ink tabular-nums">
              {w.name} <span className="text-ink2">{w.days}</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  )
}

function StudyCard({ today }: { today: ISODate }) {
  const { week, items, load, done, itemsDone, pending, all } = useStudyWeek(weekStart(today))
  if (pending) return <SkeletonCard />
  const test = nextTest(all, today)
  if (!items.length && !test) return null
  return (
    <Card>
      <CardHeader title="Учёба" dotClass="bg-study" context={week?.study_week ?? undefined} to="/study" />
      {items.length > 0 && <StudyHours done={done} load={load} itemsDone={itemsDone} itemsTotal={items.length} />}
      {test && (
        <div className="flex items-start gap-2 text-base">
          <CalendarDays size={20} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 flex-none text-ink2" />
          <span className="min-w-0">
            <span lang="de">{test.item.title}</span>
            <span className="block text-cap text-ink2">
              {[test.item.area, test.days === 0 ? 'сегодня' : test.days === 1 ? 'завтра' : `через ${test.days} дн · ${weekdayShort(test.item.due_date!).toLowerCase()} ${formatDayMonth(test.item.due_date!)}`]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        </div>
      )}
    </Card>
  )
}
