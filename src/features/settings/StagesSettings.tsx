import { useState } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { SkeletonCard } from '@/components/ui/Feedback'
import { formatDayMonth } from '@/lib/dates'
import { weekPointsTarget } from '@/lib/rules/activities'
import { activeHabits, minimumSet, type HabitKey } from '@/lib/rules/habits'
import { bodyDataKeys, useWrite } from '@/features/body/activityApi'
import { useStages, type Stage } from '@/features/body/api'
import { HABIT_META, minimumPhrase } from '@/features/body/habitMeta'

/** Настройки → Этапы: the minimum set (rule 13) and the weekly activity target (rule 25) per glow-up stage. */
export function StagesSettings() {
  const stages = useStages()
  if (stages.isPending) return <SkeletonCard />
  const list = (stages.data ?? []).filter((s) => s.sphere === 'body')
  return (
    <Card>
      <CardHeader title="Этапы глоу-апа" context={list.length ? `${list.length}` : undefined} />
      {list.length === 0 ? (
        <p className="m-0 text-cap text-ink2">Этапы придут из глоу-ап трекера при импорте. До тех пор минимум — {minimumPhrase(minimumSet(null))}.</p>
      ) : (
        list.map((s) => <StageRow key={s.id} stage={s} />)
      )}
    </Card>
  )
}

function StageRow({ stage }: { stage: Stage }) {
  const write = useWrite('plan_stages', bodyDataKeys.stages)
  const set = minimumSet(stage)
  const habits = activeHabits(stage)
  const [target, setTarget] = useState(String(weekPointsTarget(stage) ?? ''))

  const toggle = (k: HabitKey) => {
    const next = set.includes(k) ? set.filter((x) => x !== k) : [...set, k]
    if (next.length === 0) return // the set is never empty
    write.update.mutate({ id: stage.id, patch: { minimum_habits: next } })
  }
  const saveTarget = () => {
    const n = Number(target.replace(',', '.'))
    const targets = { ...((stage.targets as Record<string, unknown>) ?? {}) }
    if (target.trim() && Number.isFinite(n) && n > 0) targets.activity_points_week = n
    else delete targets.activity_points_week
    write.update.mutate({ id: stage.id, patch: { targets: targets as Stage['targets'] } })
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3 first-of-type:border-t-0">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 text-base font-semibold">{stage.name}</span>
        <span className="text-cap text-ink2 tabular-nums">
          {formatDayMonth(stage.start_date)}–{formatDayMonth(stage.end_date)}
        </span>
      </div>
      <div className="text-cap text-ink2">Минимум: {minimumPhrase(set)}</div>
      <div className="flex flex-wrap gap-2" aria-label={`Минимум этапа ${stage.name}`}>
        {(habits.length ? habits : set).map((k) => (
          <Chip key={k} selected={set.includes(k)} onClick={() => toggle(k)}>
            {HABIT_META[k].label}
          </Chip>
        ))}
      </div>
      <label className="flex items-center gap-3">
        <span className="flex-1 text-cap text-ink2">Цель недели, очки активности</span>
        <input
          inputMode="decimal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onBlur={saveTarget}
          aria-label={`Цель недели этапа ${stage.name}`}
          className="h-11 w-24 rounded-xl border border-line2 bg-card px-3 text-right text-base text-ink tabular-nums"
        />
      </label>
    </div>
  )
}
