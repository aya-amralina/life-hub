import { useState } from 'react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { addDaysISO, type ISODate } from '@/lib/dates'
import { formatHours, plural } from '@/lib/format'
import { LOAD_LABEL, plannedItems, studyItemsOfWeek, weekCapacity, weekLoad } from '@/lib/rules/study'
import { usePatchItems, type Item } from '@/features/items/api'
import { useWeekRow, type Week } from '@/features/weeks/api'
import { weekLabel } from './weekLabel'

/**
 * «Куда перенести?» (design 3g): waiting flexible items go to a chosen week; each week shows its load
 * before → after and what it becomes (rule 7). «Снять» takes one item off the plan.
 */
export function MoveSheet({
  open,
  onClose,
  waiting,
  all,
  weeks,
  monday,
  subtitle,
}: {
  open: boolean
  onClose: () => void
  waiting: readonly Item[]
  all: readonly Item[]
  weeks: readonly Week[]
  monday: ISODate
  /** instead of «N гибких пунктов · M ч — не влезли в Н04» (e.g. a stuck item from the review) */
  subtitle?: string
}) {
  const options = [1, 2, 3, 4].map((n) => addDaysISO(monday, 7 * n))
  const hours = waiting.reduce((s, i) => s + (Number(i.hours_est) || 0), 0)
  const loads = options.map((m) => {
    const week = weeks.find((w) => w.start_date === m) ?? null
    const capacity = weekCapacity(week)
    const before = weekLoad(plannedItems(studyItemsOfWeek(all, m, week?.id ?? null)), capacity)
    const after = weekLoad([...plannedItems(studyItemsOfWeek(all, m, week?.id ?? null)), ...waiting], capacity)
    return { monday: m, capacity, before, after }
  })
  const freest = loads.reduce((best, l) => (l.after.hours - l.capacity.base < best.after.hours - best.capacity.base ? l : best), loads[0]!)
  const [pick, setPick] = useState<ISODate | null>(null)
  const target = pick ?? freest.monday
  const patch = usePatchItems()
  const weekRow = useWeekRow()
  const toast = useToast()

  const move = async () => {
    const week = await weekRow(target, weeks)
    const before = waiting.map((i) => ({ id: i.id, patch: { week_id: i.week_id, rollover_count: i.rollover_count } }))
    patch.mutate(
      waiting.map((i) => ({ id: i.id, patch: { week_id: week.id, rollover_count: i.rollover_count + 1 } })),
      {
        onSuccess: () => {
          toast({ text: `Перенесено в ${weekLabel(target, weeks)}`, actionLabel: 'Вернуть', onAction: () => patch.mutate(before) })
          onClose()
        },
      },
    )
  }

  const takeOff = (i: Item) => {
    patch.mutate([{ id: i.id, patch: { status: 'снято' } }], {
      onSuccess: () => toast({ text: `${i.title} снят`, actionLabel: 'Вернуть', onAction: () => patch.mutate([{ id: i.id, patch: { status: i.status } }]) }),
    })
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      label="Куда перенести?"
      header={
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-title font-semibold">Куда перенести?</h2>
          <span className="text-cap text-ink2 tabular-nums">
            {subtitle ?? (
              <>
                {waiting.length} {plural(waiting.length, ['гибкий пункт', 'гибких пункта', 'гибких пунктов'])} · {formatHours(hours)} — не влезли в {weekLabel(monday, weeks)}
              </>
            )}
          </span>
        </div>
      }
    >
      <ul className="m-0 flex list-none flex-col gap-1 rounded-xl bg-sub p-0 px-3 py-2">
        {waiting.map((i) => (
          <li key={i.id} className="flex min-h-11 items-center gap-2 text-base">
            <span lang="de" className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              {[i.area, i.title].filter(Boolean).join(' · ')}
              {i.hours_est ? <span className="text-ink2"> · {formatHours(Number(i.hours_est))}</span> : null}
            </span>
            <button type="button" onClick={() => takeOff(i)} className="h-11 px-2 text-cap font-semibold text-ink active:bg-line">
              Снять
            </button>
          </li>
        ))}
      </ul>
      <div role="radiogroup" aria-label="Неделя" className="flex flex-col gap-2">
        {loads.map((l) => {
          const selected = target === l.monday
          const basePct = (l.capacity.base / l.capacity.max) * 100
          return (
            <button
              key={l.monday}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPick(l.monday)}
              className={cn('flex flex-col gap-2 rounded-xl border p-3 text-left', selected ? 'border-[1.5px] border-inv' : 'border-line2')}
            >
              <span className="flex items-center gap-2 text-base tabular-nums">
                <span className={cn('size-5 flex-none rounded-full border-[1.5px]', selected ? 'border-[6px] border-inv' : 'border-line2')} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{weekLabel(l.monday, weeks, true)}</span>
                </span>
                <span className="text-cap text-ink2">
                  {formatHours(l.before.hours)} → {formatHours(l.after.hours)}
                </span>
              </span>
              <span className="relative h-2 overflow-hidden rounded-[4px] bg-sub">
                <span className="absolute inset-y-0 left-0 bg-study" style={{ width: `${Math.min(100, (l.before.hours / l.capacity.max) * 100)}%` }} />
                <span
                  className="absolute inset-y-0 bg-study opacity-40"
                  style={{ left: `${Math.min(100, (l.before.hours / l.capacity.max) * 100)}%`, width: `${Math.max(0, Math.min(100, (l.after.hours / l.capacity.max) * 100) - Math.min(100, (l.before.hours / l.capacity.max) * 100))}%` }}
                />
                <span className="absolute -top-1 h-3.5 w-0.5 bg-ink" style={{ left: `${basePct}%` }} />
              </span>
              <span className="flex items-center gap-2 text-cap text-ink2">
                станет: {LOAD_LABEL[l.after.status]}
                {l.monday === freest.monday && <span className="rounded-md bg-study-soft px-1.5 text-ink">свободнее всего</span>}
              </span>
            </button>
          )
        })}
      </div>
      <p className="m-0 text-cap text-ink2">| база {formatHours(freest.capacity.base)} · шкала до {formatHours(freest.capacity.max)}</p>
      <Button onClick={() => void move()} disabled={!waiting.length || patch.isPending}>
        Перенести в {weekLabel(target, weeks)}
      </Button>
    </BottomSheet>
  )
}
