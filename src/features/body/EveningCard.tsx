import { Minus, Moon, Plus } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { Scale } from '@/components/ui/Scale'
import { cn } from '@/components/ui/cn'
import { hourBerlin, todayBerlin, type ISODate } from '@/lib/dates'
import { plural } from '@/lib/format'
import { useDailyLog, useSaveDailyLog } from './api'

const ONE_TO_TEN = Array.from({ length: 10 }, (_, i) => ({ value: i + 1 }))
// 5 … 12 h in half-hour steps
const SLEEP = Array.from({ length: 15 }, (_, i) => 5 + i / 2).map((v) => ({ value: v, label: String(v).replace('.', ',') }))
const SLUMP = [
  { value: 'yes', label: 'Да' },
  { value: 'no', label: 'Нет' },
] as const

export const MOOD_OPENS_AT = 18
const MAX_CUPS = 20
const cupsWord = (n: number) => plural(n, ['чашка', 'чашки', 'чашек'])

/** Evening block: energy, sleep, mood, slump, coffee — one tap per question. Mood opens after 18:00 (today). */
export function EveningCard({ date, title = 'Вечер' }: { date: ISODate; title?: string }) {
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)
  if (log.isPending) return <SkeletonCard />

  const moodLocked = date === todayBerlin() && hourBerlin() < MOOD_OPENS_AT
  const slump = log.data?.slump === true ? 'yes' : log.data?.slump === false ? 'no' : null

  return (
    <Card>
      <CardHeader title={title} icon={<Moon size={20} strokeWidth={1.75} aria-hidden="true" className="text-ink2" />} />
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
          label="Сон, ч"
          options={SLEEP}
          value={log.data?.sleep_h ?? null}
          onChange={(v) => save.mutate({ sleep_h: v })}
          format={(v) => String(v).replace('.', ',')}
        />
        <Scale
          label="Настроение"
          options={ONE_TO_TEN}
          value={log.data?.mood ?? null}
          onChange={(v) => save.mutate({ mood: v })}
          disabled={moodLocked}
          disabledHint={`откроется после ${MOOD_OPENS_AT}:00`}
        />
        <Scale
          label="Провал после обеда"
          options={SLUMP}
          columns={2}
          value={slump}
          onChange={(v) => save.mutate({ slump: v === null ? null : v === 'yes' })}
          format={(v) => (v === 'yes' ? 'да' : 'нет')}
        />
        <CoffeeField value={log.data?.coffee_cups ?? null} onChange={(v) => save.mutate({ coffee_cups: v })} />
      </div>
    </Card>
  )
}

/** «Кофе»: Нет / Да (tapping the chosen one again clears it); «Да» opens a cups counter, 1 … 20. */
function CoffeeField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const drank = value !== null && value > 0
  const key = (selected: boolean) =>
    cn(
      'flex h-11 items-center justify-center rounded-xl text-base transition-transform duration-100',
      selected ? 'bg-inv font-semibold text-on-inv' : 'bg-sub text-ink active:scale-[.96] active:bg-line2',
    )
  const step = 'flex size-11 flex-none items-center justify-center rounded-lg bg-card text-ink transition-transform duration-100 active:scale-[.96] disabled:bg-transparent disabled:text-dis disabled:scale-100'
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
        <div className="flex items-center gap-2 rounded-xl bg-sub p-1">
          <button type="button" aria-label="На одну чашку меньше" disabled={value <= 1} onClick={() => onChange(value - 1)} className={step}>
            <Minus size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <output aria-live="polite" className="flex flex-1 items-baseline justify-center gap-1 tabular-nums">
            <span className="text-title font-semibold">{value}</span>
            <span className="text-cap text-ink2">{cupsWord(value)}</span>
          </output>
          <button type="button" aria-label="Ещё чашка" disabled={value >= MAX_CUPS} onClick={() => onChange(value + 1)} className={step}>
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
