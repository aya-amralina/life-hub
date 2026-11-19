import { BedDouble } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { HabitButton } from '@/components/ui/HabitButton'
import { Stepper } from '@/components/ui/Stepper'
import { addDaysISO, type ISODate } from '@/lib/dates'
import { formatHours } from '@/lib/format'
import { SLEEP_MAX, SLEEP_MIN, lastBefore, stepSleep } from '@/lib/rules/day'
import { activeOn, habitsDone, minimumDone, minimumOn, minimumPhrase, visibleOn } from '@/lib/rules/habits'
import { useDailyLog, useLogsSince, useSaveDailyLog } from './api'
import { habitIcon } from './habitMeta'
import { useHabitDay, useSetMarks } from './habitsApi'

/**
 * «Привычки дня»: one tap marks, a second unmarks. Habits are data (rule 12: active by their plan); in «минимум» only
 * the minimum set is shown and the card names it (rule 13). Below — last night's sleep: a morning mark, a counter in
 * half-hour steps that starts from the previous value.
 */
export function HabitsCard({ date, to }: { date: ISODate; to?: string }) {
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)
  const recent = useLogsSince(addDaysISO(date, -14))
  const minimum = log.data?.minimum_mode ?? false
  const { isPending, habits, plans, day } = useHabitDay(date, minimum)
  const mark = useSetMarks(date)

  if (log.isPending || isPending) return <SkeletonCard />

  const active = activeOn(habits, plans, date)
  const set = minimumOn(habits, plans, date)
  const shown = visibleOn(habits, plans, date, minimum)
  const ids = (list: readonly { id: string }[]) => list.map((h) => h.id)
  const marked = shown.filter((h) => day.done.has(h.id)).length

  const sleep = log.data?.sleep_h == null ? null : Number(log.data.sleep_h)
  const lastSleep = lastBefore(recent.data ?? [], date, (l) => (l.sleep_h == null ? null : Number(l.sleep_h)))

  const context = minimum
    ? minimumDone(day, ids(set))
      ? 'минимум · засчитан'
      : `минимум · ${marked} из ${set.length}`
    : `${habitsDone(day, ids(active), ids(set))} из ${active.length}`

  return (
    <Card>
      <CardHeader title="Привычки дня" dotClass="bg-body" context={context} to={to} />
      {minimum && <p className="m-0 text-cap text-ink2">Минимум: {minimumPhrase(set)}. Остальное подождёт.</p>}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(2, Math.min(3, shown.length))}, minmax(0, 1fr))` }}>
        {shown.map((h) => (
          <HabitButton
            key={h.id}
            icon={habitIcon(h.icon)}
            label={h.name}
            checked={day.done.has(h.id)}
            onToggle={() => mark.mutate([{ habit_id: h.id, done: !day.done.has(h.id) }])}
          />
        ))}
      </div>
      <SleepRow value={sleep} last={lastSleep} onChange={(v) => save.mutate({ sleep_h: v })} />
    </Card>
  )
}

export function SleepRow({ value, last, onChange, bare = false }: { value: number | null; last: number | null; onChange: (v: number | null) => void; bare?: boolean }) {
  return (
    <div role="group" aria-label="Сон" className={bare ? 'flex min-h-11 items-center gap-3' : 'flex items-center gap-3 border-t border-line pt-3'}>
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
