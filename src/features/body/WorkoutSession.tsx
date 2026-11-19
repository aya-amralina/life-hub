import { useState } from 'react'
import { Check, TrendingUp } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { Stepper } from '@/components/ui/Stepper'
import { YesNo } from '@/components/ui/YesNo'
import { cn } from '@/components/ui/cn'
import { formatDayMonth, todayBerlin, type ISODate } from '@/lib/dates'
import { templateTitle } from '@/lib/rules/bodyDay'
import { rulesLine } from '@/lib/rules/core'
import {
  backToBack,
  exerciseVariant,
  lastPlace,
  lastTimes,
  nextInQueue,
  parseExercises,
  prefill,
  readyToProgress,
  strengthDates,
  timeLine,
  type Exercise,
  type Place,
} from '@/lib/rules/workouts'
import { useActivityTypes, useStrengthSets, type StrengthSet } from './activityApi'
import { useCoreProgram } from './coreApi'
import { useWorkoutSessions, useWorkoutWrites, useWorkouts, type WorkoutSession, type WorkoutTemplate } from './habitsApi'

export const WORKOUT_PATH = '/body/training/workout'
const PLACES = [
  { value: 'home', label: 'Дома' },
  { value: 'gym', label: 'Зал' },
] as const
const PROGRESS: Record<Place, string> = { home: 'пора усложнить: резинка потуже или рюкзак тяжелее', gym: 'пора усложнить: вес больше' }

/**
 * Тело → Тренировки → силовая: today's session of the template next in the queue (or `?t=A`). Exercises in the variant
 * of the current «Кор» stage, home or gym; three sets with reps and load filled from last time, a set is ticked with one
 * tap; cardio last, in minutes; «Домик был?» (only for the «пора усложнить» hints) and «Готово».
 */
export function WorkoutSessionScreen() {
  const today = todayBerlin()
  const workouts = useWorkouts()
  const sessions = useWorkoutSessions()
  const sets = useStrengthSets()
  const program = useCoreProgram()
  const [params] = useSearchParams()
  if (workouts.isPending || sessions.isPending || sets.isPending || program.isPending) return <SkeletonCard />
  const { templates, queue } = workouts.data ?? { templates: [], queue: [] }
  const all = sessions.data ?? []
  const current = all.find((s) => s.date === today)
  const dates = strengthDates(all, sets.data ?? [])
  const byCode = templates.find((t) => t.code === params.get('t') && !t.archived_at)
  const next = nextInQueue(queue, dates.filter((d) => d !== today), today)
  const template = templates.find((t) => t.id === current?.template_id) ?? byCode ?? templates.find((t) => t.id === next?.template_id) ?? templates.find((t) => !t.archived_at)
  if (!template) return <EmptyState title="Шаблонов пока нет">Они появятся здесь, когда будут заведены.</EmptyState>
  return (
    <Session
      key={`${template.id}:${current?.id ?? 'new'}`}
      today={today}
      template={template}
      session={current}
      sessions={all}
      rows={sets.data ?? []}
      coreStage={program.data?.stage ?? 1}
      afterYesterday={backToBack(dates, today)}
    />
  )
}

function Session({
  today,
  template,
  session,
  sessions,
  rows,
  coreStage,
  afterYesterday,
}: {
  today: ISODate
  template: WorkoutTemplate
  session: WorkoutSession | undefined
  sessions: WorkoutSession[]
  rows: StrengthSet[]
  coreStage: number
  afterYesterday: boolean
}) {
  const [sessionId] = useState(() => session?.id ?? crypto.randomUUID())
  const [place, setPlace] = useState<Place>(() => (session?.place === 'gym' ? 'gym' : session ? 'home' : lastPlace(sessions)))
  const writes = useWorkoutWrites(sessionId, today, { template_id: template.id, place })
  const types = useActivityTypes()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const exercises = parseExercises(template.exercises)
  const strength = exercises.filter((e) => e.kind !== 'cardio')
  const cardio = exercises.find((e) => e.kind === 'cardio')
  const lastCardio = [...sessions].reverse().find((s) => s.cardio_min && s.id !== sessionId)?.cardio_min ?? 15
  const [cardioMin, setCardioMin] = useState<number>(session?.cardio_min ?? lastCardio)
  const [cardioDone, setCardioDone] = useState<boolean>(Boolean(session?.cardio_min))
  const [dome, setDome] = useState<boolean | null>(session?.dome ?? null)
  const finished = Boolean(session?.done_at)

  const finish = () => {
    // the type «Кардио» comes from migration 0023 (by its key, else by name); without it the minutes stay on the session only
    const list = types.data ?? []
    const cardioType = list.find((t) => t.source_id === 'type:cardio') ?? list.find((t) => t.name.trim().toLowerCase() === 'кардио')
    writes.finish
      .mutateAsync({ dome, cardio: cardioDone ? cardioMin : null, cardioTypeId: cardioType?.id ?? null, activityId: cardioDone && cardioType ? crypto.randomUUID() : null })
      .then((r) => toast({ text: r === 'queued' ? 'Силовая засчитана на телефоне — отправится, когда будет сеть' : 'Силовая засчитана' }))
      .catch(() => {}) // a failure is told app-wide
    if (location.key !== 'default') navigate(-1)
    else navigate('/body')
  }

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-title font-semibold">{templateTitle(template)}</h2>
        <span className="text-cap text-ink2">{template.name.replace(/^Силовая [A-ZА-Я]\s*—\s*/, '')}</span>
      </div>
      {afterYesterday && !finished && <p className="m-0 text-cap text-ink2">Вчера уже была силовая — можно и сегодня, если тело согласно.</p>}
      <SegmentedTabs
        label="Где"
        segments={PLACES}
        value={place}
        onChange={(v) => {
          setPlace(v)
          writes.session.mutate({ place: v })
        }}
      />
      {template.reminders.length > 0 && <p className="m-0 rounded-xl bg-sub px-3 py-2 text-cap text-ink2">{rulesLine(template.reminders)}</p>}

      {strength.map((e) => (
        <ExerciseCard
          key={e.key}
          exercise={e}
          code={template.code}
          place={place}
          coreStage={coreStage}
          today={today}
          row={rows.find((r) => r.session_id === sessionId && r.exercise_key === e.key)}
          rows={rows}
          sessions={sessions}
          onSave={(w) => writes.set.mutate(w)}
        />
      ))}

      {cardio && (
        <Card>
          <div className="flex items-start gap-3">
            <TickButton done={cardioDone} label={`${cardio.name}: сделано`} onToggle={() => setCardioDone(!cardioDone)} />
            <div className="min-w-0 flex-1">
              <h3 className={cn('m-0 text-base font-semibold', cardioDone && 'text-ink3')}>{cardio.name}</h3>
              <div className="text-cap text-ink2">{exerciseVariant(cardio, coreStage, place)}</div>
            </div>
          </div>
          <Stepper onMinus={() => setCardioMin(Math.max(5, cardioMin - 5))} onPlus={() => setCardioMin(Math.min(180, cardioMin + 5))} minusLabel="Кардио: на 5 минут меньше" plusLabel="Кардио: на 5 минут больше" minusDisabled={cardioMin <= 5} plusDisabled={cardioMin >= 180}>
            <span className="text-title font-semibold tabular-nums">{cardioMin}</span>
            <span className="text-cap text-ink2">мин</span>
          </Stepper>
        </Card>
      )}

      <Card>
        <YesNo label="Домик был?" value={dome} onChange={setDome} clearable />
        {finished ? (
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-base">Силовая засчитана</span>
            <Button variant="quiet" onClick={() => writes.undo.mutate(session?.activity_id ?? null)}>
              Не засчитывать
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={finish}>
            Готово
          </Button>
        )}
      </Card>
      <Link to="/body/training/strength" className="flex min-h-11 items-center self-start text-cap text-ink2 underline underline-offset-4">
        Журнал силовых
      </Link>
    </>
  )
}

/** One exercise: the variant of the «Кор» stage, three sets (reps · load · tick), «пора усложнить», the last 3 times. */
function ExerciseCard({
  exercise,
  code,
  place,
  coreStage,
  today,
  row,
  rows,
  sessions,
  onSave,
}: {
  exercise: Exercise
  code: string
  place: Place
  coreStage: number
  today: ISODate
  row: StrengthSet | undefined
  rows: StrengthSet[]
  sessions: WorkoutSession[]
  onSave: (w: { exercise_key: string; exercise: string; workout: string; reps: number[]; loads: string[]; sets_done: boolean[] }) => void
}) {
  const earlier = lastTimes(rows, sessions, exercise.key, today)
  const start = row ? { reps: row.reps, loads: row.loads ?? [] } : prefill(earlier[0], exercise)
  const n = exercise.sets ?? 3
  const [reps, setReps] = useState<string[]>(() => Array.from({ length: n }, (_, i) => (start.reps[i] == null ? '' : String(start.reps[i]))))
  const [loads, setLoads] = useState<string[]>(() => Array.from({ length: n }, (_, i) => start.loads[i] ?? ''))
  const [done, setDone] = useState<boolean[]>(() => Array.from({ length: n }, (_, i) => row?.sets_done?.[i] ?? false))
  const progress = readyToProgress(earlier[0], sessions.find((s) => s.id === earlier[0]?.session_id), exercise)
  const allDone = done.every(Boolean)
  const save = (nextDone: boolean[]) =>
    onSave({ exercise_key: exercise.key, exercise: exercise.name, workout: code, reps: reps.map((r) => Number(r) || 0), loads, sets_done: nextDone })

  return (
    <Card>
      <div>
        <h3 className={cn('m-0 text-base font-semibold', allDone && 'text-ink3')}>{exercise.name}</h3>
        <div className="text-cap text-ink2">
          {[exercise.sets ? `${exercise.sets} × ${exercise.reps}` : exercise.reps, exerciseVariant(exercise, coreStage, place)].filter(Boolean).join(' · ')}
        </div>
        {progress && (
          <div className="mt-1 flex items-center gap-1 text-cap font-semibold text-ink">
            <TrendingUp size={16} strokeWidth={1.75} aria-hidden="true" className="text-body" />
            {PROGRESS[place]}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} role="group" aria-label={`${exercise.name}, подход ${i + 1}`} className="flex items-center gap-2">
            <span className="w-4 flex-none text-cap text-ink3 tabular-nums">{i + 1}</span>
            <input
              inputMode="numeric"
              aria-label="Повторы"
              value={reps[i]}
              onChange={(e) => setReps(reps.map((r, j) => (j === i ? e.target.value.replace(/\D/g, '') : r)))}
              className={cn('h-11 w-16 rounded-xl border border-line2 bg-card px-3 text-right text-base tabular-nums', done[i] ? 'text-ink3' : 'text-ink')}
            />
            <input
              aria-label="Вес или резинка"
              placeholder={place === 'gym' ? 'кг' : 'резинка, рюкзак'}
              value={loads[i]}
              onChange={(e) => setLoads(loads.map((l, j) => (j === i ? e.target.value : l)))}
              className={cn('h-11 min-w-0 flex-1 rounded-xl border border-line2 bg-card px-3 text-base', done[i] ? 'text-ink3' : 'text-ink')}
            />
            <TickButton
              done={done[i]!}
              label={`Подход ${i + 1}: сделан`}
              onToggle={() => {
                const next = done.map((d, j) => (j === i ? !d : d))
                setDone(next)
                save(next)
              }}
            />
          </div>
        ))}
      </div>
      {earlier.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-cap text-ink3" aria-label={`${exercise.name}: прошлые разы`}>
          {earlier.map((r) => (
            <li key={r.id}>{timeLine(r, formatDayMonth)}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function TickButton({ done, label, onToggle }: { done: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={done} aria-label={label} onClick={onToggle} className="flex size-11 flex-none items-center justify-center">
      {done ? (
        <span className="flex size-7 items-center justify-center rounded-lg bg-inv text-on-inv">
          <Check size={18} strokeWidth={2.25} aria-hidden="true" />
        </span>
      ) : (
        <span className="size-7 rounded-lg border-[1.5px] border-line2" />
      )}
    </button>
  )
}
