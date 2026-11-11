import { Card, CardHeader } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { HabitButton } from '@/components/ui/HabitButton'
import type { ISODate } from '@/lib/dates'
import { activeHabits, habitsDone, minimumDone, minimumSet, stageForDate, visibleHabits } from '@/lib/rules/habits'
import { useDailyLog, useSaveDailyLog, useStages } from './api'
import { HABIT_META, minimumPhrase } from './habitMeta'

/**
 * «Привычки дня»: one tap marks, a second unmarks. Habits come from the current stage (rule 12); in
 * «минимум» only the stage's minimum set is shown and the card names it (rule 13).
 */
export function HabitsCard({ date, to }: { date: ISODate; to?: string }) {
  const stages = useStages()
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)

  if (stages.isPending || log.isPending) return <SkeletonCard />

  const stage = stages.data?.length ? stageForDate(stages.data, date) : null
  const minimum = log.data?.minimum_mode ?? false
  const set = minimumSet(stage)
  const shown = visibleHabits(stage, minimum)
  const marked = shown.filter((k) => log.data?.[k]).length

  const context = minimum
    ? minimumDone(log.data, set)
      ? 'минимум · засчитан'
      : `минимум · ${marked} из ${set.length}`
    : `${habitsDone(log.data, activeHabits(stage), set)} из ${activeHabits(stage).length}`

  return (
    <Card>
      <CardHeader title="Привычки дня" dotClass="bg-body" context={context} to={to} />
      {minimum && <p className="m-0 text-cap text-ink2">Минимум: {minimumPhrase(set)}. Остальное подождёт.</p>}
      <div className="grid grid-cols-3 gap-2">
        {shown.map((key) => {
          const meta = HABIT_META[key]
          return (
            <HabitButton
              key={key}
              icon={meta.icon}
              label={meta.label}
              checked={log.data?.[key] ?? false}
              onToggle={() => save.mutate({ [key]: !(log.data?.[key] ?? false) })}
            />
          )
        })}
      </div>
    </Card>
  )
}
