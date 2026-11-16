import { useState } from 'react'
import { CalendarClock, ChartLine, Dumbbell, Flag, NotebookPen, Pill, Ruler, Stethoscope, X } from 'lucide-react'
import { Navigate, useParams } from 'react-router'
import { useAddAction, useOpenAdd } from '@/app/addSheetContext'
import { IconButton } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Switch } from '@/components/ui/Switch'
import { WeekSwitcher } from '@/components/ui/WeekSwitcher'
import { CalendarLink } from '@/components/layout/CalendarLink'
import { MoreList, SectionHeader, type MoreLink } from '@/components/layout/MoreList'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { addDaysISO, formatDayMonth, formatRelativeDay, formatWeekdayDate, todayBerlin, weekStart, type ISODate } from '@/lib/dates'
import { activityPoints, dayPoints, weekPoints, weekPointsTarget } from '@/lib/rules/activities'
import { careChoice, careDone, careItems, toggleCare } from '@/lib/rules/care'
import { activeHabits, minimumSet, stageForDate, weekHabitShare } from '@/lib/rules/habits'
import { isItemOpen, isUpcoming } from '@/lib/rules/items'
import { plural } from '@/lib/format'
import { NotesSection } from '@/features/notes/NotesCard'
import { useItems, useUpdateItem } from '@/features/items/api'
import { donePatch, reopenPatch } from '@/features/items/donePatch'
import { ItemQuestions } from '@/features/items/ItemQuestions'
import { ItemRow } from '@/features/items/ItemRow'
import { ActivitySheet } from './ActivitySheet'
import { BodyCharts } from './BodyCharts'
import { DayNoteCard } from '@/features/journal/DayNoteCard'
import { bodyDataKeys, useActivities, useActivityTypes, useWrite } from './activityApi'
import { useDailyLog, useSaveDailyLog, useStages, useWeekLogs } from './api'
import { EveningCard } from './EveningCard'
import { HABIT_META, minimumPhrase } from './habitMeta'
import { HabitsCard } from './HabitsCard'
import { IntakeTab } from './IntakeTab'
import { MeasurementsTab } from './MeasurementsTab'
import { StrengthTab } from './StrengthTab'

const BACK = '/body'
const SECTIONS = {
  tasks: 'Задачи и визиты',
  charts: 'Графики',
  strength: 'Сила',
  measure: 'Замеры',
  intake: 'Приём',
  stage: 'Этап',
  notes: 'Справка и заметки',
} as const
type Section = keyof typeof SECTIONS

const MORE: readonly MoreLink[] = [
  { to: '/body/tasks', label: 'Задачи и визиты', icon: Stethoscope },
  { to: '/body/charts', label: 'Графики', icon: ChartLine },
  { to: '/body/strength', label: 'Сила', icon: Dumbbell },
  { to: '/body/measure', label: 'Замеры', icon: Ruler },
  { to: '/body/intake', label: 'Приём', icon: Pill },
  { to: '/body/stage', label: 'Этап', icon: Flag },
  { to: '/body/notes', label: 'Справка и заметки', icon: NotebookPen },
]

/** Тело: the day on the main view; tasks, charts, journals, the stage and notes one tap deeper. */
export function BodyScreen() {
  const section = useParams()['*'] ?? ''
  if (section === '') {
    return (
      <>
        <ScreenHeader title="Тело" right={<CalendarLink sphere="body" />} />
        <DayTab />
        <MoreList links={MORE} />
      </>
    )
  }
  if (!(section in SECTIONS)) return <Navigate to={BACK} replace />
  const s = section as Section
  return (
    <>
      <SectionHeader title={SECTIONS[s]} back={BACK} sphere="Тело" right={s === 'tasks' ? <CalendarLink sphere="body" /> : undefined} />
      {s === 'tasks' && <BodyTasks />}
      {s === 'charts' && (
        <>
          <AddActivity />
          <WeekShare date={todayBerlin()} />
          <BodyCharts />
        </>
      )}
      {s === 'strength' && <StrengthTab />}
      {s === 'measure' && <MeasurementsTab />}
      {s === 'intake' && <IntakeTab />}
      {s === 'stage' && <StageCard />}
      {s === 'notes' && <NotesSection sphere="body" />}
    </>
  )
}

/** «+» of a section that shows movement: a new activity today. */
function AddActivity() {
  const [adding, setAdding] = useState(false)
  useAddAction(() => setAdding(true))
  return <ActivitySheet open={adding} onClose={() => setAdding(false)} date={todayBerlin()} />
}

function DayTab() {
  const today = todayBerlin()
  const [date, setDate] = useState<ISODate>(today)
  const log = useDailyLog(date)
  const minimum = log.data?.minimum_mode ?? false
  // «+» on the day: an activity on the day shown (in «минимум» too)
  const [adding, setAdding] = useState(false)
  useAddAction(() => setAdding(true))
  return (
    <>
      <WeekSwitcher
        label={`${formatRelativeDay(date, today)}${date === today ? `, ${formatDayMonth(date)}` : ''}`}
        onPrev={() => setDate(addDaysISO(date, -1))}
        onNext={() => setDate(addDaysISO(date, 1))}
        nextDisabled={date >= today}
        onReset={date !== today ? () => setDate(today) : undefined}
        resetLabel="Сегодня"
      />
      <ItemQuestions sphere="body" />
      <MinimumCard date={date} />
      <HabitsCard date={date} />
      {minimum ? (
        <MinimumRest />
      ) : (
        <>
          <MovementCard date={date} />
          <CareCard date={date} />
        </>
      )}
      <EveningCard date={date} />
      <DayNoteCard date={date} />
      <ActivitySheet open={adding} onClose={() => setAdding(false)} date={date} />
    </>
  )
}

function useStageFor(date: ISODate) {
  const stages = useStages()
  const stage = stages.data?.length ? stageForDate(stages.data, date) : null
  return { stages, stage }
}

/** Rule 13: the switch names the stage's minimum set. */
function MinimumCard({ date }: { date: ISODate }) {
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)
  const { stage } = useStageFor(date)
  if (log.isPending) return <SkeletonCard />
  const on = log.data?.minimum_mode ?? false
  const phrase = minimumPhrase(minimumSet(stage))
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">Режим минимум</div>
          <div className="text-cap text-ink2">Только {phrase} — для тяжёлых дней</div>
        </div>
        <Switch checked={on} onChange={(v) => save.mutate({ minimum_mode: v })} label="Режим минимум" />
      </div>
    </Card>
  )
}

function MinimumRest() {
  return (
    <section className="flex flex-col gap-1 rounded-2xl border border-dashed border-line2 p-4">
      <div className="text-base font-semibold">Сегодня — минимум</div>
      <p className="m-0 text-cap text-ink2">
        Движение и уход подождут. Хватит привычек минимума и пары слов о самочувствии. Пропуск — это сигнал, а не провал.
      </p>
    </section>
  )
}

/** «Движение»: several activities a day with a score (rule 25), the week against the stage target. */
function MovementCard({ date }: { date: ISODate }) {
  const types = useActivityTypes()
  const activities = useActivities()
  const write = useWrite('activities', bodyDataKeys.activities)
  const { stage } = useStageFor(date)
  if (types.isPending || activities.isPending) return <SkeletonCard />
  const all = activities.data ?? []
  const typeList = types.data ?? []
  const today = all.filter((a) => a.date === date)
  const day = dayPoints(all, typeList, date)
  const week = weekPoints(all, typeList, weekStart(date))
  const target = weekPointsTarget(stage)
  const num = (n: number) => String(n).replace('.', ',')
  const points = (n: number) => (Number.isInteger(n) ? plural(n, ['очко', 'очка', 'очков']) : 'очка')

  return (
    <Card>
      <CardHeader title="Движение" dotClass="bg-body" context={today.length ? `скор дня ${num(day)}` : undefined} />
      {today.length === 0 ? (
        <p className="m-0 text-cap text-ink2">Пока ничего. Прогулка тоже считается — запиши через «+».</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {today.map((a) => {
            const t = typeList.find((x) => x.id === a.type_id)
            return (
              <li key={a.id} className="flex min-h-12 items-center gap-3 border-t border-line first:border-t-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-base">{t?.name ?? 'Активность'}</span>
                  <span className="block text-cap text-ink2">{[a.minutes ? `${a.minutes} мин` : 'минуты не указаны', t?.intensity, a.note].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="text-base font-semibold tabular-nums">+{num(t ? activityPoints(a.minutes, t.points_per_10min) : 0)}</span>
                <IconButton shape="square" label={`Удалить ${t?.name ?? 'активность'}`} className="border-transparent text-ink3" onClick={() => write.remove.mutate(a.id)}>
                  <X size={20} strokeWidth={1.75} aria-hidden="true" />
                </IconButton>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-col gap-2">
        <div className="text-cap text-ink2 tabular-nums">{target ? `Неделя: ${num(week)} из ${num(target)} ${points(target)}` : `Неделя: ${num(week)} ${points(week)}`}</div>
        {target && <ProgressBar value={Math.min(week, target)} max={target} fillClass="bg-body" label="Очки недели" />}
      </div>
    </Card>
  )
}

/** «Уход»: the stage's care list (Настройки → Этапы); a past «Вечер: лицо» mark is shown as it was. */
function CareCard({ date }: { date: ISODate }) {
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)
  const { stage } = useStageFor(date)
  if (log.isPending) return <SkeletonCard />
  const entries = careItems(stage)
  const marked = log.data?.care ?? []
  const plain = entries.filter((e) => !e.options)
  const groups = entries.filter((e) => e.options)
  // a past «Вечер: лицо» mark is shown only when no evening group holds it
  const face = log.data?.face_evening ?? null
  const faceShown = face && !groups.some((g) => careChoice(marked, g) === face)
  return (
    <Card>
      <CardHeader title="Уход" dotClass="bg-body" context={`${careDone(marked, entries)} из ${entries.length}`} />
      {groups.map((g) => (
        <fieldset key={g.raw} className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-cap text-ink2">{g.label}</legend>
          <div className="flex flex-wrap gap-2">
            {g.options!.map((o) => (
              <Chip key={o} selected={careChoice(marked, g) === o} onClick={() => save.mutate({ care: toggleCare(marked, g, o) })}>
                {o}
              </Chip>
            ))}
          </div>
        </fieldset>
      ))}
      {plain.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {plain.map((e) => (
            <Chip key={e.raw} selected={marked.includes(e.label)} onClick={() => save.mutate({ care: toggleCare(marked, e) })}>
              {e.label}
            </Chip>
          ))}
        </div>
      )}
      {faceShown && <p className="m-0 text-cap text-ink2">Вечер: лицо — {face} (старая отметка)</p>}
    </Card>
  )
}

function WeekShare({ date }: { date: ISODate }) {
  const monday = weekStart(date)
  const logs = useWeekLogs(monday)
  const stages = useStages()
  if (!logs.data || !stages.data) return null
  const share = weekHabitShare(logs.data, stages.data, monday, todayBerlin())
  if (share === null) return null
  return (
    <Card>
      <CardHeader title="Неделя" dotClass="bg-body" context="привычки" />
      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-big font-semibold">{Math.round(share * 100)} %</span>
        <span className="text-base text-ink2">отмечено</span>
      </div>
      <p className="m-0 text-cap text-ink2">Без стриков — каждый день с чистого листа.</p>
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
  if (stages.isPending) return null
  const list = stages.data ?? []
  const next = list.find((s) => s.sphere === 'body' && s.start_date > today)
  if (!list.length) {
    return <EmptyState title="Этапов пока нет">Их заводят в настройках. А пока считаются все три привычки, минимум — вода и 10 минут на улице.</EmptyState>
  }
  return (
    <>
      {stage ? (
        <Card>
          <CardHeader title={stage.name} dotClass="bg-body" context={`${formatDayMonth(stage.start_date)}–${formatDayMonth(stage.end_date)}`} />
          <div className="text-cap text-ink2">Привычки этапа</div>
          <div className="flex flex-wrap gap-2">
            {activeHabits(stage).map((k) => (
              <span key={k} className="inline-flex h-8 items-center rounded-lg bg-sub px-3 text-cap text-ink">
                {HABIT_META[k].label}
              </span>
            ))}
          </div>
          <div className="text-cap text-ink2">Минимум: {minimumPhrase(minimumSet(stage))}</div>
        </Card>
      ) : (
        <EmptyState title="Сейчас нет активного этапа">Привычки считаются все три.</EmptyState>
      )}
      {next && (
        <EmptyState title={`Дальше: ${next.name}`}>{`С ${formatDayMonth(next.start_date)}. Новые привычки появятся сами, когда этап начнётся.`}</EmptyState>
      )}
    </>
  )
}
