import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { SkeletonCard } from '@/components/ui/Feedback'
import { formatDayMonth, todayBerlin } from '@/lib/dates'
import { weekPointsTarget } from '@/lib/rules/activities'
import { careEntries, careTimeOfDay, careTitle, parseCare } from '@/lib/rules/care'
import { activeOn, minimumOn, minimumPhrase } from '@/lib/rules/habits'
import { bodyDataKeys, useWrite } from '@/features/body/activityApi'
import { useStages, type Stage } from '@/features/body/api'
import { useHabits, useSaveHabits, type HabitStep } from '@/features/body/habitsApi'

/**
 * Настройки → Этапы: the minimum set (rule 13 — a field of each habit), the care list of «Отметка дня» (care habits;
 * removing archives them — their marks stay) and the weekly activity target (rule 25) per glow-up stage.
 */
export function StagesSettings() {
  const stages = useStages()
  const habits = useHabits()
  if (stages.isPending || habits.isPending) return <SkeletonCard />
  const list = (stages.data ?? []).filter((s) => s.sphere === 'body')
  return (
    <Card>
      <CardHeader title="Этапы глоу-апа" context={list.length ? `${list.length}` : undefined} />
      <MinimumRow />
      <CareRows />
      {list.length === 0 ? <p className="m-0 text-cap text-ink2">Этапов пока нет.</p> : list.map((s) => <StageRow key={s.id} stage={s} />)}
    </Card>
  )
}

function MinimumRow() {
  const today = todayBerlin()
  const habits = useHabits()
  const save = useSaveHabits()
  const { habits: all, plans } = habits.data ?? { habits: [], plans: [] }
  const daily = activeOn(all, plans, today)
  const set = minimumOn(all, plans, today)
  const marked = daily.filter((h) => h.in_minimum)
  const toggle = (id: string, on: boolean) => {
    if (!on && marked.length === 1 && marked[0]!.id === id) return // the set is never empty
    save.mutate([{ action: 'update', id, patch: { in_minimum: on } }])
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="text-cap text-ink2">Минимум: {minimumPhrase(set)}</div>
      <div className="flex flex-wrap gap-2" aria-label="Минимум">
        {daily.map((h) => {
          const on = h.in_minimum
          return (
            <Chip key={h.id} selected={on} onClick={() => toggle(h.id, !on)}>
              {h.name}
            </Chip>
          )
        })}
      </div>
    </div>
  )
}

function CareRows() {
  const today = todayBerlin()
  const habits = useHabits()
  const save = useSaveHabits()
  const [newCare, setNewCare] = useState('')
  const { habits: all, plans } = habits.data ?? { habits: [], plans: [] }
  const entries = careEntries(all, plans, today)
  const ids = (e: (typeof entries)[number]) => (e.options ? e.options.map((o) => o.id) : e.id ? [e.id] : [])
  const archive = (e: (typeof entries)[number]) =>
    save.mutate(ids(e).map((id): HabitStep => ({ action: 'update', id, patch: { archived_at: new Date().toISOString() } })))
  const add = (raw: string) => {
    const { group, names } = parseCare(raw)
    const next = Math.max(0, ...all.filter((h) => h.kind === 'care').map((h) => h.sort_order)) + 10
    save.mutate(
      names.map((name, i): HabitStep => ({
        action: 'insert',
        habit: { id: crypto.randomUUID(), kind: 'care', name, group_name: group, time_of_day: careTimeOfDay(group), starts_on: today, sort_order: next + i },
        from_date: today,
      })),
    )
  }
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="text-cap text-ink2">Уход на «Отметке дня»</div>
      <ul className="m-0 flex list-none flex-col p-0" aria-label="Уход">
        {entries.map((e) => (
          <li key={e.key} className="flex min-h-11 items-center gap-2 text-base">
            <span className="min-w-0 flex-1">{careTitle(e)}</span>
            <IconButton shape="square" label={`Убрать «${careTitle(e)}»`} className="border-transparent text-ink3" disabled={entries.length === 1} onClick={() => archive(e)}>
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
          </li>
        ))}
      </ul>
      <p className="m-0 text-cap text-ink2">Выбор из вариантов — через двоеточие и черту: «Вечер: Ниацинамид | Азелаинка». Убранный пункт уходит в архив, его отметки остаются.</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const raw = newCare.trim()
          if (!raw || entries.some((x) => careTitle(x) === raw || x.label === raw)) return
          add(raw)
          setNewCare('')
        }}
      >
        <input
          value={newCare}
          onChange={(e) => setNewCare(e.target.value)}
          placeholder="Крем для тела или Утро: SPF | Стик"
          aria-label="Новый пункт ухода"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line2 bg-card px-3 text-base text-ink"
        />
        <IconButton shape="square" label="Добавить пункт ухода" type="submit" disabled={!newCare.trim()}>
          <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      </form>
    </div>
  )
}

function StageRow({ stage }: { stage: Stage }) {
  const write = useWrite('plan_stages', bodyDataKeys.stages)
  const [target, setTarget] = useState(String(weekPointsTarget(stage) ?? ''))
  const saveTarget = () => {
    const n = Number(target.replace(',', '.'))
    const targets = { ...((stage.targets as Record<string, unknown>) ?? {}) }
    if (target.trim() && Number.isFinite(n) && n > 0) targets.activity_points_week = n
    else delete targets.activity_points_week
    write.update.mutate({ id: stage.id, patch: { targets: targets as Stage['targets'] } })
  }
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 text-base font-semibold">{stage.name}</span>
        <span className="text-cap text-ink2 tabular-nums">
          {formatDayMonth(stage.start_date)}–{formatDayMonth(stage.end_date)}
        </span>
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
