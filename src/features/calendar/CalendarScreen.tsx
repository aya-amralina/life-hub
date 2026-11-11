import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { ChevronLeft, Plus } from 'lucide-react'
import { useOpenAdd } from '@/app/addSheetContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button, IconButton } from '@/components/ui/Button'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { FilterChips } from '@/components/ui/FilterChips'
import { MetaChip } from '@/components/ui/MetaChip'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { WeekSwitcher } from '@/components/ui/WeekSwitcher'
import { cn } from '@/components/ui/cn'
import { SPHERE_CLASS, SPHERE_LABEL, type Sphere } from '@/lib/constants'
import { addDaysISO, formatDayMonth, formatWeekdayDate, parseISODate, todayBerlin, weekStart, weekdayShort, type ISODate } from '@/lib/dates'
import { formatEur } from '@/lib/format'
import {
  DEFAULT_FILTERS,
  bandsOn,
  calendarBands,
  calendarEvents,
  monthGrid,
  parseFilters,
  type CalendarBand,
  type CalendarEvent,
  type CalendarFilter,
} from '@/lib/rules/calendar'
import { useIntake } from '@/features/body/activityApi'
import { useStages } from '@/features/body/api'
import { useItems } from '@/features/items/api'
import { useAllTransactions } from '@/features/money/api'
import { useAllWeeks } from '@/features/weeks/api'

const STORE = 'lifehub.calendar.filters'
const SPHERES: Sphere[] = ['money', 'work', 'study', 'body', 'personal']
const VIEWS = [
  { value: 'month', label: 'Месяц' },
  { value: 'week', label: 'Неделя' },
] as const
const KIND_LABEL: Record<CalendarEvent['kind'], string> = {
  due: 'срок',
  day: 'в этот день',
  start: 'начало',
  money: 'по плану',
}
const BAND_CLASS: Record<CalendarBand['kind'], string> = {
  place: 'bg-line2',
  stage: 'bg-body-soft',
  intake: 'bg-body',
}

function readFilters(): CalendarFilter[] {
  try {
    return parseFilters(localStorage.getItem(STORE))
  } catch {
    return [...DEFAULT_FILTERS]
  }
}

/** Календарь (SPEC §5): month with sphere dots, week by days, the day sheet; filters by sphere, bands of places and stages. */
export function CalendarScreen() {
  const today = todayBerlin()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const fromSphere = params.get('sphere') as Sphere | null
  const [view, setView] = useState<'month' | 'week'>('month')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [monday, setMonday] = useState(weekStart(today))
  const [day, setDay] = useState<ISODate | null>(null)
  // opened from a sphere: filtered by it (not saved); otherwise the remembered filters
  const [filters, setFilters] = useState<CalendarFilter[]>(() => (fromSphere && SPHERES.includes(fromSphere) ? [fromSphere] : readFilters()))

  const items = useItems()
  const txs = useAllTransactions()
  const weeks = useAllWeeks()
  const stages = useStages()
  const intake = useIntake()

  const events = useMemo(() => calendarEvents(items.data ?? [], txs.data ?? [], filters), [items.data, txs.data, filters])
  const bands = useMemo(
    () => calendarBands(weeks.data ?? [], stages.data ?? [], intake.data ?? [], filters, today),
    [weeks.data, stages.data, intake.data, filters, today],
  )
  const byDay = useMemo(() => {
    const m = new Map<ISODate, CalendarEvent[]>()
    for (const e of events) m.set(e.date, [...(m.get(e.date) ?? []), e])
    return m
  }, [events])

  const setAndStore = (next: CalendarFilter[]) => {
    const value = next.length ? next : [...DEFAULT_FILTERS]
    setFilters(value)
    if (!fromSphere) {
      try {
        localStorage.setItem(STORE, JSON.stringify(value))
      } catch {
        // storage blocked — filters just are not remembered
      }
    }
  }
  const selected: CalendarFilter[] = DEFAULT_FILTERS.every((f) => filters.includes(f)) && filters.length === DEFAULT_FILTERS.length ? [] : filters
  const pending = items.isPending || txs.isPending || weeks.isPending

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2 pt-4">
        <IconButton shape="square" label="Назад" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        <h1 className="m-0 flex-1 text-big font-semibold tracking-[-0.01em]">Календарь</h1>
      </header>
      <SegmentedTabs label="Вид" segments={VIEWS} value={view} onChange={setView} />
      <FilterChips
        label="Сферы"
        multi
        options={[
          ...SPHERES.map((s) => ({
            value: s as CalendarFilter,
            label: SPHERE_LABEL[s],
            dotClass: SPHERE_CLASS[s].dot,
          })),
          { value: 'intake' as CalendarFilter, label: 'Приём' },
        ]}
        selected={selected}
        onChange={(next) => setAndStore(next.length === 1 && next[0] === 'intake' ? [...DEFAULT_FILTERS, 'intake'] : next)}
      />
      {view === 'month' ? (
        <>
          <WeekSwitcher
            label={format(parseISODate(`${month}-01`), 'LLLL yyyy', {
              locale: ru,
            })}
            onPrev={() => setMonth(shift(month, -1))}
            onNext={() => setMonth(shift(month, 1))}
            onReset={month !== today.slice(0, 7) ? () => setMonth(today.slice(0, 7)) : undefined}
            resetLabel="Сегодня"
          />
          {pending ? <SkeletonCard /> : <MonthView month={month} today={today} byDay={byDay} bands={bands} onDay={setDay} />}
        </>
      ) : (
        <>
          <WeekSwitcher
            label={`${formatDayMonth(monday)} — ${formatDayMonth(addDaysISO(monday, 6))}`}
            onPrev={() => setMonday(addDaysISO(monday, -7))}
            onNext={() => setMonday(addDaysISO(monday, 7))}
            onReset={monday !== weekStart(today) ? () => setMonday(weekStart(today)) : undefined}
            resetLabel="Эта неделя"
          />
          {pending ? <SkeletonCard /> : <WeekView monday={monday} today={today} byDay={byDay} bands={bands} onDay={setDay} />}
        </>
      )}
      <DaySheet
        day={day}
        onClose={() => setDay(null)}
        events={day ? (byDay.get(day) ?? []) : []}
        bands={day ? bandsOn(bands, day) : []}
        today={today}
      />
    </div>
  )
}

function shift(month: string, n: number): string {
  const d = parseISODate(`${month}-01`)
  d.setMonth(d.getMonth() + n)
  return format(d, 'yyyy-MM')
}

function MonthView({
  month,
  today,
  byDay,
  bands,
  onDay,
}: {
  month: string
  today: ISODate
  byDay: Map<ISODate, CalendarEvent[]>
  bands: CalendarBand[]
  onDay: (d: ISODate) => void
}) {
  const grid = monthGrid(month)
  const monthBands = bands.filter((b) => b.from.slice(0, 7) <= month && b.to.slice(0, 7) >= month)
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-2" aria-label="Месяц">
      <div className="grid grid-cols-7 text-center text-cap text-ink3">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {grid.flat().map((d) => {
          const list = byDay.get(d) ?? []
          const spheres = [...new Set(list.map((e) => e.sphere))].slice(0, 4)
          const inMonth = d.slice(0, 7) === month
          const dayBands = bandsOn(bands, d)
          return (
            <button
              key={d}
              type="button"
              onClick={() => onDay(d)}
              aria-label={`${formatWeekdayDate(d)}: ${list.length ? `${list.length} в плане` : 'пусто'}${dayBands.length ? ` · ${dayBands.map((b) => b.label).join(', ')}` : ''}`}
              className="flex min-h-14 flex-col items-center gap-1 rounded-xl pt-1 active:bg-sub"
            >
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-base tabular-nums',
                  d === today ? 'bg-inv font-semibold text-on-inv' : inMonth ? 'text-ink' : 'text-ink3',
                )}
              >
                {Number(d.slice(8))}
              </span>
              <span className="flex h-2 gap-0.5">
                {spheres.map((s) => (
                  <span key={s} className={cn('size-2 rounded-full', SPHERE_CLASS[s].dot)} />
                ))}
              </span>
              <span className="flex w-full flex-col gap-0.5">
                {dayBands.slice(0, 2).map((b) => (
                  <span
                    key={b.kind + b.label}
                    className={cn('h-1 w-full', BAND_CLASS[b.kind], b.from === d && 'rounded-l-full', b.to === d && 'rounded-r-full')}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      {monthBands.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 px-2 pb-1 text-cap text-ink2">
          {monthBands.map((b) => (
            <li key={b.kind + b.label + b.from} className="flex items-center gap-2">
              <span className={cn('h-1.5 w-4 rounded-full', BAND_CLASS[b.kind])} />
              <span className="min-w-0 flex-1 truncate">{b.label}</span>
              <span className="tabular-nums">
                {formatDayMonth(b.from)} — {formatDayMonth(b.to)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function WeekView({
  monday,
  today,
  byDay,
  bands,
  onDay,
}: {
  monday: ISODate
  today: ISODate
  byDay: Map<ISODate, CalendarEvent[]>
  bands: CalendarBand[]
  onDay: (d: ISODate) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i))
  const any = days.some((d) => (byDay.get(d) ?? []).length)
  return (
    <section className="flex flex-col gap-2" aria-label="Неделя">
      {days.map((d) => {
        const list = byDay.get(d) ?? []
        const dayBands = bandsOn(bands, d)
        return (
          <button
            key={d}
            type="button"
            onClick={() => onDay(d)}
            className="flex flex-col gap-1 rounded-2xl border border-line bg-card px-4 py-3 text-left active:bg-sub"
          >
            <span className="flex items-center gap-2">
              <span className={cn('text-base tabular-nums', d === today ? 'font-semibold' : '')}>
                {weekdayShort(d)} {formatDayMonth(d)}
                {d === today ? ' · сегодня' : ''}
              </span>
              {dayBands.map((b) => (
                <span
                  key={b.kind + b.label}
                  className={cn('truncate rounded-md px-1.5 text-cap', b.kind === 'intake' ? 'bg-body-soft text-ink2' : 'bg-sub text-ink2')}
                >
                  {b.label}
                </span>
              ))}
            </span>
            {list.map((e, i) => (
              <EventLine key={i} e={e} />
            ))}
          </button>
        )
      })}
      {!any && <p className="m-0 text-cap text-ink2">На этой неделе ничего не запланировано.</p>}
    </section>
  )
}

function EventLine({ e }: { e: CalendarEvent }) {
  return (
    <span className={cn('flex items-center gap-2 text-cap', e.done ? 'text-ink3' : 'text-ink')}>
      <span className={cn('size-2 flex-none rounded-full', SPHERE_CLASS[e.sphere].dot)} />
      <span className="w-11 flex-none tabular-nums text-ink2">{e.time ?? ''}</span>
      <span
        lang={e.sphere === 'work' || e.sphere === 'study' ? 'de' : undefined}
        className={cn('min-w-0 flex-1 truncate text-base', e.done && 'line-through')}
      >
        {e.title}
      </span>
      {e.kind === 'money' && e.amountCents !== undefined ? (
        <span className="tabular-nums">
          {e.amountCents > 0 ? '+' : e.amountCents < 0 ? '−' : ''}
          {formatEur(Math.abs(e.amountCents), { whole: true })}
        </span>
      ) : (
        e.kind !== 'day' && <MetaChip kind={e.kind === 'start' ? 'from' : 'flag'} text={KIND_LABEL[e.kind]} />
      )}
    </span>
  )
}

function DaySheet({
  day,
  onClose,
  events,
  bands,
  today,
}: {
  day: ISODate | null
  onClose: () => void
  events: CalendarEvent[]
  bands: CalendarBand[]
  today: ISODate
}) {
  const navigate = useNavigate()
  const openAdd = useOpenAdd()
  return (
    <BottomSheet
      open={day !== null}
      onClose={onClose}
      label={day ? formatWeekdayDate(day) : 'День'}
      header={
        day && (
          <div className="flex flex-col">
            <h2 className="m-0 text-title font-semibold">
              {format(parseISODate(day), 'EEEE, d MMMM', {
                locale: ru,
              }).replace(/^./, (c) => c.toUpperCase())}
            </h2>
            {day === today && <span className="text-cap text-ink2">сегодня</span>}
          </div>
        )
      }
    >
      {bands.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {bands.map((b) => (
            <span key={b.kind + b.label} className="rounded-md bg-sub px-2 py-[3px] text-cap text-ink2">
              {b.label} · {formatDayMonth(b.from)} — {formatDayMonth(b.to)}
            </span>
          ))}
        </div>
      )}
      {events.length === 0 ? (
        <EmptyState title="В этот день ничего нет">Можно добавить пункт — он встанет на этот день.</EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {events.map((e, i) => (
            <li key={i} className="border-t border-line first:border-t-0">
              {e.itemId ? (
                <button
                  type="button"
                  onClick={() => navigate(`/item/${e.itemId}`)}
                  className="flex min-h-12 w-full items-center py-1 text-left active:bg-sub"
                >
                  <EventLine e={e} />
                </button>
              ) : (
                <div className="flex min-h-12 items-center py-1">
                  <EventLine e={e} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {day && (
        <Button
          variant="secondary"
          icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}
          onClick={() => {
            onClose()
            openAdd('item', { date: day })
          }}
        >
          Пункт на этот день
        </Button>
      )}
    </BottomSheet>
  )
}
