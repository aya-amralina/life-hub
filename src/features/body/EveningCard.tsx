import { Moon } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { Scale } from '@/components/ui/Scale'
import { hourBerlin, todayBerlin, type ISODate } from '@/lib/dates'
import { useDailyLog, useSaveDailyLog } from './api'

const ONE_TO_TEN = Array.from({ length: 10 }, (_, i) => ({ value: i + 1 }))
// 5 … 12 h in half-hour steps
const SLEEP = Array.from({ length: 15 }, (_, i) => 5 + i / 2).map((v) => ({ value: v, label: String(v).replace('.', ',') }))
const SLUMP = [
  { value: 'yes', label: 'Да' },
  { value: 'no', label: 'Нет' },
] as const

export const MOOD_OPENS_AT = 18

/** Evening block: energy, sleep, mood, slump — one tap per question. Mood opens after 18:00 (today). */
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
      </div>
    </Card>
  )
}
