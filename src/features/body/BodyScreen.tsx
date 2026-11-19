import { useState } from 'react'
import { CalendarClock, Settings } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import { useAddAction, useOpenAdd } from '@/app/addSheetContext'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { CalendarLink } from '@/components/layout/CalendarLink'
import { RouteTabs, type RouteTab } from '@/components/layout/RouteTabs'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { addDaysISO, formatDayMonth, formatLongDate, formatWeekdayDate, todayBerlin, weekStart, weekdayShort, type ISODate } from '@/lib/dates'
import { strengthWeek, weekLine } from '@/lib/rules/bodyDay'
import { weekDaysActive, weekSessions } from '@/lib/rules/core'
import { strengthDates } from '@/lib/rules/workouts'
import { activeOn, dayMarks, daySet, minimumOn, minimumPhrase, stageForDate, weekHabitShare } from '@/lib/rules/habits'
import { isItemOpen, isUpcoming } from '@/lib/rules/items'
import { NotesSection } from '@/features/notes/NotesCard'
import { useItems, useUpdateItem } from '@/features/items/api'
import { donePatch, reopenPatch } from '@/features/items/donePatch'
import { ItemRow } from '@/features/items/ItemRow'
import { StagesSettings } from '@/features/settings/StagesSettings'
import { ActivitySheet } from './ActivitySheet'
import { BodyCharts } from './BodyCharts'
import { BodyToday } from './BodyToday'
import { useStrengthSets } from './activityApi'
import { useCoreProgram, useCoreSessions } from './coreApi'
import { CoreSession } from './CoreSession'
import { useStages, useWeekLogs } from './api'
import { useHabits, useMarks, useWorkoutSessions, useWorkouts } from './habitsApi'
import { IntakeTab } from './IntakeTab'
import { MeasurementsTab } from './MeasurementsTab'
import { StrengthTab } from './StrengthTab'
import { TrainingTab } from './TrainingTab'
import { WorkoutSessionScreen } from './WorkoutSession'

const TABS: readonly RouteTab[] = [
  { to: '/body', label: 'Сегодня', end: true },
  { to: '/body/training', label: 'Тренировки' },
  { to: '/body/health', label: 'Здоровье' },
  { to: '/body/charts', label: 'Динамика' },
]
const HEALTH: readonly RouteTab[] = [
  { to: '/body/health/intake', label: 'Приём' },
  { to: '/body/health/tasks', label: 'Задачи' },
  { to: '/body/health/measure', label: 'Замеры' },
  { to: '/body/health/notes', label: 'Справка' },
]

/** The addresses before the tabs (step 3) — old links and bookmarks still land on their screen. */
const MOVED: Record<string, string> = {
  core: '/body/training/core',
  strength: '/body/training/strength',
  intake: '/body/health/intake',
  tasks: '/body/health/tasks',
  measure: '/body/health/measure',
  notes: '/body/health/notes',
  health: '/body/health/intake',
  stage: '/body/settings',
}

/**
 * Тело (step 3): tabs Сегодня · Тренировки · Здоровье · Динамика, the gear — stages and habits. The screens inside the
 * tabs only moved here; their redesign comes later.
 */
export function BodyScreen() {
  const path = useParams()['*'] ?? ''
  const today = todayBerlin()
  const [date, setDate] = useState<ISODate>(today)
  if (path in MOVED) return <Navigate to={MOVED[path]!} replace />
  const [tab, sub] = path.split('/')
  const known =
    path === '' || path === 'charts' || path === 'settings' || path === 'training' || (tab === 'training' && ['strength', 'core', 'workout'].includes(sub ?? '')) || (tab === 'health' && ['intake', 'tasks', 'measure', 'notes'].includes(sub ?? ''))
  if (!known) return <Navigate to="/body" replace />
  return (
    <>
      <ScreenHeader
        title="Тело"
        right={
          <Link to="/body/settings" aria-label="Настройки привычек и этапы" className="flex size-11 flex-none items-center justify-center rounded-full text-ink active:bg-sub">
            <Settings size={22} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        }
      />
      <HeaderLine date={path === '' ? date : today} />
      {path !== 'settings' && <RouteTabs tabs={TABS} label="Вкладки «Тела»" />}
      {path === '' && <BodyToday date={date} setDate={setDate} />}
      {path === 'training' && <TrainingTab />}
      {tab === 'training' && sub && (
        <Link to="/body/training" className="flex min-h-11 items-center self-start text-base text-ink2 no-underline">
          ← Тренировки
        </Link>
      )}
      {path === 'training/workout' && <WorkoutSessionScreen />}
      {path === 'training/strength' && <StrengthTab />}
      {path === 'training/core' && <CoreSession />}
      {tab === 'health' && <RouteTabs tabs={HEALTH} label="Здоровье" variant="sub" />}
      {path === 'health/intake' && <IntakeTab />}
      {path === 'health/tasks' && (
        <>
          <div className="flex justify-end">
            <CalendarLink sphere="body" />
          </div>
          <BodyTasks />
        </>
      )}
      {path === 'health/measure' && <MeasurementsTab />}
      {path === 'health/notes' && <NotesSection sphere="body" />}
      {path === 'charts' && (
        <>
          <AddActivity />
          <WeekShare date={today} />
          <BodyCharts />
        </>
      )}
      {path === 'settings' && (
        <>
          <Link to="/body" className="flex min-h-11 items-center self-start text-base text-ink2 no-underline">
            ← Тело
          </Link>
          <StageCard />
          <StagesSettings />
        </>
      )}
    </>
  )
}

/** «Чт, 19 ноября. Силовые 1 из 2, кор 3 из 7» — the week of the day shown. */
function HeaderLine({ date }: { date: ISODate }) {
  const workouts = useWorkouts()
  const sets = useStrengthSets()
  const workoutSessions = useWorkoutSessions()
  const program = useCoreProgram()
  const sessions = useCoreSessions()
  const p = program.data
  const strength = strengthWeek(workouts.data?.queue ?? [], strengthDates(workoutSessions.data ?? [], sets.data ?? []), date)
  const core = p && date >= p.start_date ? { done: weekSessions(sessions.data ?? [], date), of: weekDaysActive(p.start_date, date) } : null
  const line = weekLine(strength, core)
  return <p className="m-0 -mt-3 text-cap text-ink2">{[`${weekdayShort(date)}, ${formatLongDate(date)}`, line].filter(Boolean).join('. ')}</p>
}

/** «+» of a section that shows movement: a new activity today. */
function AddActivity() {
  const [adding, setAdding] = useState(false)
  useAddAction(() => setAdding(true))
  return <ActivitySheet open={adding} onClose={() => setAdding(false)} date={todayBerlin()} />
}

function useStageFor(date: ISODate) {
  const stages = useStages()
  const stage = stages.data?.length ? stageForDate(stages.data, date) : null
  return { stages, stage }
}

function WeekShare({ date }: { date: ISODate }) {
  const monday = weekStart(date)
  const logs = useWeekLogs(monday)
  const habits = useHabits()
  const marks = useMarks(monday, addDaysISO(monday, 6))
  if (!logs.data || !habits.data || !marks.data) return null
  const { habits: list, plans } = habits.data
  const share = weekHabitShare(
    (d) => dayMarks(marks.data, d, logs.data.find((l) => l.date === d)?.minimum_mode ?? false),
    (d) => daySet(list, plans, d),
    monday,
    todayBerlin(),
  )
  if (share === null) return null
  return (
    <Card>
      <CardHeader title="Неделя" dotClass="bg-body" context="привычки" />
      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-big font-semibold">{Math.round(share * 100)} %</span>
        <span className="text-base text-ink2">отмечено</span>
      </div>
    </Card>
  )
}

/** Задачи и визиты: body items with deadline kinds; «Скоро» folded. */
function BodyTasks() {
  const today = todayBerlin()
  const items = useItems()
  const update = useUpdateItem()
  const [soonOpen, setSoonOpen] = useState(false)
  const openAdd = useOpenAdd()
  useAddAction(() => openAdd('body'))
  if (items.isPending) return <SkeletonCard />
  const body = (items.data ?? []).filter((i) => i.sphere === 'body' && isItemOpen(i))
  const now = body.filter((i) => !isUpcoming(i, today))
  const soon = body.filter((i) => isUpcoming(i, today))
  if (!body.length) return <EmptyState title="Открытых задач нет">Визит к врачу или покупка к сроку — через «+».</EmptyState>
  return (
    <Card>
      <CardHeader title="Задачи и визиты" dotClass="bg-body" context={`${now.length}`} />
      <div className="flex flex-col gap-2">
        {now.map((i) => (
          <ItemRow
            key={i.id}
            item={i}
            today={today}
            showSphere={false}
            meta={i.type ?? undefined}
            onToggle={() => update.mutate({ id: i.id, patch: i.done_at ? reopenPatch(null, 'body') : donePatch('body') })}
          />
        ))}
      </div>
      {soon.length > 0 && (
        <>
          <GroupHeader
            mark={<CalendarClock size={16} strokeWidth={1.75} aria-hidden="true" className="text-ink2" />}
            title="Скоро"
            count={soon.length}
            summary={`ближайшее ${formatWeekdayDate(soon.map((i) => i.starts_on!).sort()[0]!)}`}
            open={soonOpen}
            onToggle={() => setSoonOpen(!soonOpen)}
          />
          {soonOpen && soon.map((i) => <ItemRow key={i.id} item={i} today={today} showSphere={false} onToggle={() => update.mutate({ id: i.id, patch: donePatch('body') })} />)}
        </>
      )}
    </Card>
  )
}

function StageCard() {
  const today = todayBerlin()
  const openAdd = useOpenAdd()
  useAddAction(() => openAdd('body'))
  const { stages, stage } = useStageFor(today)
  const habits = useHabits()
  if (stages.isPending || habits.isPending) return null
  const list = stages.data ?? []
  const next = list.find((s) => s.sphere === 'body' && s.start_date > today)
  const { habits: all, plans } = habits.data ?? { habits: [], plans: [] }
  const phrase = minimumPhrase(minimumOn(all, plans, today))
  if (!list.length) {
    return <EmptyState title="Этапов пока нет">{`Их заводят в настройках. А пока считаются ${minimumPhrase(activeOn(all, plans, today))}, минимум — ${phrase}.`}</EmptyState>
  }
  return (
    <>
      {stage ? (
        <Card>
          <CardHeader title={stage.name} dotClass="bg-body" context={`${formatDayMonth(stage.start_date)}–${formatDayMonth(stage.end_date)}`} />
          <div className="text-cap text-ink2">Привычки этапа</div>
          <div className="flex flex-wrap gap-2">
            {activeOn(all, plans, today).map((h) => (
              <span key={h.id} className="inline-flex h-8 items-center rounded-lg bg-sub px-3 text-cap text-ink">
                {h.name}
              </span>
            ))}
          </div>
          <div className="text-cap text-ink2">Минимум: {phrase}</div>
        </Card>
      ) : (
        <EmptyState title="Сейчас нет активного этапа">{`Считаются ${minimumPhrase(activeOn(all, plans, today))}.`}</EmptyState>
      )}
      {next && (
        <EmptyState title={`Дальше: ${next.name}`}>{`С ${formatDayMonth(next.start_date)}. Новые привычки появятся сами, когда этап начнётся.`}</EmptyState>
      )}
    </>
  )
}
