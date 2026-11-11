import { useState } from 'react'
import { useToast } from '@/app/toastContext'
import { Button } from '@/components/ui/Button'
import { addDaysISO, type ISODate } from '@/lib/dates'
import { formatEur } from '@/lib/format'
import { cutNextWeek, type MoneyWeek } from '@/lib/rules/money'
import { useWeekRow } from '@/features/weeks/api'
import { fetchWeekLimits, useSaveLimits } from './api'

/** Rule 3: an overspent week offers to cut next week's limits by the overspend — only after confirmation. */
export function CutNextWeek({ monday, summary }: { monday: ISODate; summary: MoneyWeek }) {
  const save = useSaveLimits()
  const weekRow = useWeekRow()
  const toast = useToast()
  const [done, setDone] = useState(false)
  if (done) return null
  const over = summary.categories.filter((c) => c.deviationCents > 0).reduce((s, c) => s + c.deviationCents, 0)

  const apply = async () => {
    const next = addDaysISO(monday, 7)
    const week = await weekRow(next)
    const cuts = cutNextWeek(summary, await fetchWeekLimits(week.id))
    save.mutate(
      { monday: next, limits: Object.fromEntries(cuts.map((c) => [c.category, c.limitCents])) },
      {
        onSuccess: () => {
          setDone(true)
          toast({ text: `Лимиты следующей недели меньше на ${formatEur(cuts.reduce((s, c) => s + c.cutCents, 0))}` })
        },
      },
    )
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4" aria-label="Перерасход">
      <div className="text-base font-semibold">Перерасход {formatEur(over)}</div>
      <p className="m-0 text-cap text-ink2">Можно срезать эту сумму с лимитов следующей недели — по тем же категориям. Ничего не поменяется, пока не подтвердишь.</p>
      <Button variant="secondary" onClick={() => void apply()} disabled={save.isPending}>
        Срезать со следующей недели
      </Button>
    </section>
  )
}
