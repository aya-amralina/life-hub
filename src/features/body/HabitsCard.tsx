import { Card, CardHeader } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { HabitButton } from '@/components/ui/HabitButton'
import type { ISODate } from '@/lib/dates'
import { activeHabits, habitsDone, stageForDate } from '@/lib/rules/habits'
import { useDailyLog, useSaveDailyLog, useStages } from './api'
import { HABIT_META } from './habitMeta'

/** «Привычки дня»: one tap marks, a second unmarks. Habits come from the current stage (rule 12). */
export function HabitsCard({ date, to }: { date: ISODate; to?: string }) {
  const stages = useStages()
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)

  if (stages.isPending || log.isPending) return <SkeletonCard />

  const stage = stages.data?.length ? stageForDate(stages.data, date) : null
  const active = activeHabits(stage)
  const done = habitsDone(log.data, active)
  const minimum = log.data?.minimum_mode ?? false

  return (
    <Card>
      <CardHeader title="Привычки дня" dotClass="bg-body" context={minimum ? 'минимум · засчитан' : `${done} из ${active.length}`} to={to} />
      <div className="grid grid-cols-3 gap-2">
        {active.map((key) => {
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
