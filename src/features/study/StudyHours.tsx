import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatHours } from '@/lib/format'
import { loadPhrase } from '@/lib/rules/day'
import { LOAD_LABEL, type LoadStatus } from '@/lib/rules/study'

/** «12 ч из 27,5 ч» (closed / planned) + capacity status of the plan (rule 7). */
export function StudyHours({
  done,
  load,
  itemsDone,
  itemsTotal,
  brief = false,
}: {
  done: number
  load: { hours: number; base: number; max: number; status: LoadStatus }
  itemsDone: number
  itemsTotal: number
  /** «Сегодня»: the plan in plain words instead of the numbers of rule 7. */
  brief?: boolean
}) {
  if (load.hours === 0) {
    // No hour estimates yet (manual items before import) — count items instead of «0 ч из 0 ч».
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-title font-semibold">{itemsDone}</span>
          <span className="text-base text-ink2">из {itemsTotal} {plural(itemsTotal)}</span>
        </div>
        <ProgressBar value={itemsDone} max={itemsTotal} fillClass="bg-study" label="Пункты недели" />
        <div className="text-cap text-ink2">Часы не указаны — считаю пунктами.</div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 tabular-nums">
        <span className="text-title font-semibold">{formatHours(done)}</span>
        <span className="text-base text-ink2">из {formatHours(load.hours)}</span>
      </div>
      <ProgressBar value={done} max={load.hours} fillClass="bg-study" label="Часы недели" />
      <div className={load.status === 'ok' ? 'text-cap text-ink2 tabular-nums' : 'text-cap font-semibold text-amber-ink tabular-nums'}>
        {brief ? loadPhrase(load) : `План ${formatHours(load.hours)} · база ${formatHours(load.base)}, максимум ${formatHours(load.max)} — ${LOAD_LABEL[load.status]}`}
      </div>
    </div>
  )
}

function plural(n: number): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'пункта'
  return 'пунктов'
}
