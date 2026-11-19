import { useState } from 'react'
import { Check } from 'lucide-react'
import { Link } from 'react-router'
import { Card, CardHeader } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { cn } from '@/components/ui/cn'
import { formatDayMonth, todayBerlin } from '@/lib/dates'
import { strengthDays, templateTitle } from '@/lib/rules/bodyDay'
import { coreLine, nextTestDay } from '@/lib/rules/core'
import { backToBack, exerciseVariant, parseExercises, queueOn, strengthDates } from '@/lib/rules/workouts'
import { useStrengthSets } from './activityApi'
import { CORE_PATH, useCoreProgram } from './coreApi'
import { useWorkoutSessions, useWorkouts, type WorkoutTemplate } from './habitsApi'
import { WORKOUT_PATH } from './WorkoutSession'

const linkButton = 'inline-flex h-12 flex-none items-center justify-center rounded-xl border border-line2 bg-card px-4 text-base font-semibold text-ink no-underline active:bg-sub'

/** Тело → Тренировки: the week of the queue, «Кор», the templates (their make-up by a tap), the old journal. */
export function TrainingTab() {
  const today = todayBerlin()
  const workouts = useWorkouts()
  const sessions = useWorkoutSessions()
  const sets = useStrengthSets()
  const program = useCoreProgram()
  if (workouts.isPending || sessions.isPending || sets.isPending || program.isPending) return <SkeletonCard />
  const { templates, queue } = workouts.data ?? { templates: [], queue: [] }
  const dates = strengthDates(sessions.data ?? [], sets.data ?? [])
  const slots = queueOn(queue, today)
  const done = strengthDays(dates, today).length
  const doneToday = dates.includes(today)
  const p = program.data
  const stage = p?.stage ?? 1

  return (
    <>
      <Card>
        <CardHeader title="Неделя" dotClass="bg-body" context={slots.length ? `Силовые ${Math.min(done, slots.length)} из ${slots.length}` : undefined} />
        <ol className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Очередь недели">
          {slots.map((s, i) => {
            const t = templates.find((x) => x.id === s.template_id)
            const isDone = i < done
            const isNext = i === done
            return (
              <li key={s.position} className={cn('inline-flex h-9 items-center gap-1 rounded-lg px-3 text-base', isDone ? 'bg-sub text-ink3' : isNext ? 'border border-ink text-ink' : 'border border-line2 text-ink2')}>
                {t?.code ?? '?'}
                {isDone && <Check size={16} strokeWidth={2} aria-label="сделано" className="text-body" />}
                {isNext && <span className="text-cap text-ink2">— следующая</span>}
              </li>
            )
          })}
        </ol>
        {doneToday ? (
          <p className="m-0 text-cap text-ink2">Сегодня силовая засчитана.</p>
        ) : done < slots.length ? (
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-cap text-ink2">{backToBack(dates, today) ? 'Вчера уже была силовая.' : ''}</span>
            <Link to={WORKOUT_PATH} className={linkButton}>
              Начать силовую
            </Link>
          </div>
        ) : (
          <p className="m-0 text-cap text-ink2">Неделя по силовым закрыта.</p>
        )}
      </Card>

      {p && today >= p.start_date && (
        <Card>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-base font-semibold">Кор</h2>
              <div className="text-cap text-ink2">
                {coreLine(p, today)} · тест пальцами {formatDayMonth(nextTestDay(p, today))}
              </div>
            </div>
            <Link to={CORE_PATH} className={linkButton}>
              Начать
            </Link>
          </div>
        </Card>
      )}

      {templates
        .filter((t) => !t.archived_at)
        .map((t) => (
          <TemplateCard key={t.id} template={t} coreStage={stage} />
        ))}

      <Link to="/body/training/strength" className="flex min-h-11 items-center self-start text-cap text-ink2 underline underline-offset-4">
        Журнал силовых
      </Link>
    </>
  )
}

/** A template: its name; by a tap — exercises in the variant of the current «Кор» stage, home and gym, and its rules. */
function TemplateCard({ template, coreStage }: { template: WorkoutTemplate; coreStage: number }) {
  const [open, setOpen] = useState(false)
  const exercises = parseExercises(template.exercises)
  return (
    <Card>
      <GroupHeader title={templateTitle(template)} summary={template.name.replace(/^Силовая [A-ZА-Я]\s*—\s*/, '')} open={open} onToggle={() => setOpen(!open)} />
      {open && (
        <>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {exercises.map((e) => (
              <li key={e.key} className="flex flex-col">
                <span className="text-base">
                  {e.name} <span className="text-ink2">· {e.sets ? `${e.sets} × ${e.reps}` : e.reps}</span>
                </span>
                <span className="text-cap text-ink2">дома — {exerciseVariant(e, coreStage, 'home')}</span>
                <span className="text-cap text-ink2">в зале — {exerciseVariant(e, coreStage, 'gym')}</span>
              </li>
            ))}
          </ul>
          {template.rules.length > 0 && (
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-cap text-ink2">
              {template.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <Link to={`${WORKOUT_PATH}?t=${encodeURIComponent(template.code)}`} className={cn(linkButton, 'self-start')}>
            Начать {template.code}
          </Link>
        </>
      )}
    </Card>
  )
}
