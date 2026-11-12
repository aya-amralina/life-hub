import { BedDouble } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { HabitButton } from '@/components/ui/HabitButton'
import { Stepper } from '@/components/ui/Stepper'
import { addDaysISO, type ISODate } from '@/lib/dates'
import { formatHours } from '@/lib/format'
import { SLEEP_MAX, SLEEP_MIN, lastBefore, stepSleep } from '@/lib/rules/day'
import { activeHabits, habitsDone, minimumDone, minimumSet, stageForDate, visibleHabits } from '@/lib/rules/habits'
import { useDailyLog, useLogsSince, useSaveDailyLog, useStages } from './api'
import { HABIT_META, minimumPhrase } from './habitMeta'

/**
 * «Привычки дня»: one tap marks, a second unmarks. Habits come from the current stage (rule 12); in
 * «минимум» only the stage's minimum set is shown and the card names it (rule 13). Below — last night's sleep:
 * a morning mark, a counter in half-hour steps that starts from the previous value.
 */
export function HabitsCard({ date, to }: { date: ISODate; to?: string }) {
  const stages = useStages()
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)
  const recent = useLogsSince(addDaysISO(date, -14))

  if (stages.isPending || log.isPending) return <SkeletonCard />

  const stage = stages.data?.length ? stageForDate(stages.data, date) : null
  const minimum = log.data?.minimum_mode ?? false
  const set = minimumSet(stage)
  const shown = visibleHabits(stage, minimum)
  const marked = shown.filter((k) => log.data?.[k]).length

  const sleep = log.data?.sleep_h == null ? null : Number(log.data.sleep_h)
  const lastSleep = lastBefore(recent.data ?? [], date, (l) => (l.sleep_h == null ? null : Number(l.sleep_h)))

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
      <SleepRow value={sleep} last={lastSleep} onChange={(v) => save.mutate({ sleep_h: v })} />
    </Card>
  )
}

function SleepRow({ value, last, onChange }: { value: number | null; last: number | null; onChange: (v: number | null) => void }) {
  return (
    <div role="group" aria-label="Сон" className="flex items-center gap-3 border-t border-line pt-3">
      <BedDouble size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink2" />
      <span className="min-w-0 flex-1">
        <span className="block text-base">Сон</span>
        <span className="block text-cap text-ink2">{value !== null ? 'этой ночью' : last !== null ? `в прошлый раз ${formatHours(last)}` : 'сколько спала'}</span>
      </span>
      <Stepper
        className="w-44 flex-none"
        onMinus={() => onChange(stepSleep(value, -1, last))}
        onPlus={() => onChange(stepSleep(value, 1, last))}
        minusLabel="Сон: на полчаса меньше"
        plusLabel="Сон: на полчаса больше"
        minusDisabled={value !== null && value <= SLEEP_MIN}
        plusDisabled={value !== null && value >= SLEEP_MAX}
      >
        {value === null ? (
          <span className="text-base text-ink3">—</span>
        ) : (
          <button type="button" onClick={() => onChange(null)} aria-label={`Сон ${formatHours(value)} — сбросить`} title="Сбросить" className="flex h-11 items-center text-title font-semibold">
            {formatHours(value)}
          </button>
        )}
      </Stepper>
    </div>
  )
}
