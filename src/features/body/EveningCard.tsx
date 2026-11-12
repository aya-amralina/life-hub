import { useState, type ReactNode } from 'react'
import { Moon } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { Scale } from '@/components/ui/Scale'
import { Stepper } from '@/components/ui/Stepper'
import { cn } from '@/components/ui/cn'
import { addDaysISO, hourBerlin, todayBerlin, type ISODate } from '@/lib/dates'
import { plural } from '@/lib/format'
import { EVENING_FROM, eveningAnswered, isEvening, lastBefore } from '@/lib/rules/day'
import { useDailyLog, useLogsSince, useSaveDailyLog } from './api'

const ONE_TO_TEN = Array.from({ length: 10 }, (_, i) => ({ value: i + 1 }))
const SLUMP = [
  { value: 'yes', label: 'Да' },
  { value: 'no', label: 'Нет' },
] as const

const MAX_CUPS = 20
const cupsWord = (n: number) => plural(n, ['чашка', 'чашки', 'чашек'])
const MOON = <Moon size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink2" />

/**
 * «Вечер»: energy, mood, slump, coffee — one tap per question (sleep is a morning mark, it lives with the habits).
 * Mood opens after 18:00 (today). `foldable` («Сегодня»): before 18:00 the card is one line and opens by a tap.
 */
export function EveningCard({ date, foldable = false, context }: { date: ISODate; foldable?: boolean; context?: ReactNode }) {
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)
  const recent = useLogsSince(addDaysISO(date, -14))
  const [opened, setOpened] = useState(false)
  if (log.isPending) return <SkeletonCard />

  const early = date === todayBerlin() && !isEvening(hourBerlin())
  const slump = log.data?.slump === true ? 'yes' : log.data?.slump === false ? 'no' : null
  const { answered, total } = eveningAnswered(log.data)

  if (foldable && early && !opened) {
    return (
      <Card>
        <GroupHeader
          mark={MOON}
          title="Вечер"
          summary={answered > 0 ? `отмечено ${answered} из ${total}` : `после ${EVENING_FROM}:00 · ${total} вопроса`}
          open={false}
          onToggle={() => setOpened(true)}
        />
      </Card>
    )
  }

  return (
    <Card>
      {foldable && early ? (
        <GroupHeader mark={MOON} title="Вечер" open onToggle={() => setOpened(false)} />
      ) : (
        <CardHeader title="Вечер" icon={MOON} context={context ?? (answered > 0 && answered < total ? `${answered} из ${total}` : undefined)} />
      )}
      <div className="flex flex-col gap-6">
        <Scale
          label="Энергия"
          options={ONE_TO_TEN}
          value={log.data?.energy ?? null}
          onChange={(v) => save.mutate({ energy: v })}
          hintLow="1 — без сил"
          hintHigh="10 — полон сил"
        />
        <Scale
          label="Настроение"
          options={ONE_TO_TEN}
          value={log.data?.mood ?? null}
          onChange={(v) => save.mutate({ mood: v })}
          disabled={early}
          disabledHint={`откроется после ${EVENING_FROM}:00`}
        />
        <Scale
          label="Провал после обеда"
          options={SLUMP}
          columns={2}
          value={slump}
          onChange={(v) => save.mutate({ slump: v === null ? null : v === 'yes' })}
          format={(v) => (v === 'yes' ? 'да' : 'нет')}
        />
        <CoffeeField
          value={log.data?.coffee_cups ?? null}
          last={lastBefore(recent.data ?? [], date, (l) => l.coffee_cups)}
          onChange={(v) => save.mutate({ coffee_cups: v })}
        />
      </div>
    </Card>
  )
}

/** «Кофе»: Нет / Да (tapping the chosen one again clears it); «Да» opens a cups counter, 1 … 20; «как в прошлый раз» — one tap. */
function CoffeeField({ value, last, onChange }: { value: number | null; last: number | null; onChange: (v: number | null) => void }) {
  const drank = value !== null && value > 0
  const key = (selected: boolean) =>
    cn(
      'flex h-11 items-center justify-center rounded-xl text-base transition-transform duration-100',
      selected ? 'bg-inv font-semibold text-on-inv' : 'bg-sub text-ink active:scale-[.96] active:bg-line2',
    )
  return (
    <div role="group" aria-label="Кофе" className="flex flex-col gap-2">
      <div className="flex justify-between text-base">
        <span>Кофе</span>
        <span className="font-semibold tabular-nums">{value === null ? '' : value === 0 ? 'без кофе' : `${value} ${cupsWord(value)}`}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={value === 0} aria-label="Кофе: нет" onClick={() => onChange(value === 0 ? null : 0)} className={key(value === 0)}>
          Нет
        </button>
        <button type="button" aria-pressed={drank} aria-label="Кофе: да" onClick={() => onChange(drank ? null : 1)} className={key(drank)}>
          Да
        </button>
      </div>
      {drank && (
        <Stepper onMinus={() => onChange(value - 1)} onPlus={() => onChange(value + 1)} minusLabel="На одну чашку меньше" plusLabel="Ещё чашка" minusDisabled={value <= 1} plusDisabled={value >= MAX_CUPS}>
          <span className="text-title font-semibold">{value}</span>
          <span className="text-cap text-ink2">{cupsWord(value)}</span>
        </Stepper>
      )}
      {value === null && last !== null && last > 0 && (
        <button type="button" onClick={() => onChange(last)} className="flex h-11 items-center self-start rounded-xl border border-line2 px-3 text-cap text-ink active:bg-sub">
          Как в прошлый раз · {last} {cupsWord(last)}
        </button>
      )}
    </div>
  )
}
