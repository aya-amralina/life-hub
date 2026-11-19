import { useState, type ReactNode } from 'react'
import { Coffee, Moon } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { Scale } from '@/components/ui/Scale'
import { Stepper } from '@/components/ui/Stepper'
import { YesNo } from '@/components/ui/YesNo'
import { hourBerlin, todayBerlin, type ISODate } from '@/lib/dates'
import { plural } from '@/lib/format'
import { EVENING_FROM, eveningAnswered, isEvening } from '@/lib/rules/day'
import { useDailyLog, useSaveDailyLog } from './api'

/** Energy and mood: one row 1–5 (since step 3; older answers were halved by migration 0022). */
const ONE_TO_FIVE = Array.from({ length: 5 }, (_, i) => ({ value: i + 1 }))

const MAX_CUPS = 20
const cupsWord = (n: number) => plural(n, ['чашка', 'чашки', 'чашек'])
const MOON = <Moon size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink2" />

/**
 * «Вечер»: energy, mood, slump — one tap per question; coffee is «Нет» until changed (sleep is a morning mark, it lives
 * with the habits). Mood opens after 18:00 (today). `foldable` («Сегодня»): before 18:00 the card is one line and opens by a tap.
 */
export function EveningCard({ date, foldable = false, context }: { date: ISODate; foldable?: boolean; context?: ReactNode }) {
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)
  const [opened, setOpened] = useState(false)
  if (log.isPending) return <SkeletonCard />

  const early = date === todayBerlin() && !isEvening(hourBerlin())
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
        <CheckIn date={date} disabledMood={early} />
        <CoffeeField cups={log.data?.coffee_cups ?? 0} onChange={(v) => save.mutate({ coffee_cups: v })} />
      </div>
    </Card>
  )
}

/** The evening check-in: energy and mood (a row 1–5), the slump [Нет | Да]. `disabledMood` — before 18:00 on «Сегодня». */
export function CheckIn({ date, disabledMood = false }: { date: ISODate; disabledMood?: boolean }) {
  const log = useDailyLog(date)
  const save = useSaveDailyLog(date)
  return (
    <>
      <Scale label="Энергия" options={ONE_TO_FIVE} value={log.data?.energy ?? null} onChange={(v) => save.mutate({ energy: v })} />
      <Scale
        label="Настроение"
        options={ONE_TO_FIVE}
        value={log.data?.mood ?? null}
        onChange={(v) => save.mutate({ mood: v })}
        disabled={disabledMood}
        disabledHint={`откроется после ${EVENING_FROM}:00`}
      />
      <YesNo label="Провал после обеда" value={log.data?.slump ?? null} onChange={(v) => save.mutate({ slump: v })} clearable />
    </>
  )
}

/** «Кофе»: [Нет | Да], «Нет» by default (no mark = 0 cups); «Да» opens a cups counter from 1, up to 20. */
export function CoffeeField({ cups, onChange }: { cups: number; onChange: (v: number) => void }) {
  const drank = cups > 0
  return (
    <div className="flex flex-col gap-2">
      <YesNo
        label="Кофе"
        icon={<Coffee size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink2" />}
        value={drank}
        onChange={(v) => onChange(v ? Math.max(1, cups) : 0)}
      />
      {drank && (
        <Stepper onMinus={() => onChange(cups - 1)} onPlus={() => onChange(cups + 1)} minusLabel="На одну чашку меньше" plusLabel="Ещё чашка" minusDisabled={cups <= 1} plusDisabled={cups >= MAX_CUPS}>
          <span className="text-title font-semibold">{cups}</span>
          <span className="text-cap text-ink2">{cupsWord(cups)}</span>
        </Stepper>
      )}
    </div>
  )
}
