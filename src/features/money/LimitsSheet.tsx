import { useState, type FormEvent } from 'react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { WEEK_CATEGORIES, type WeekCategory } from '@/lib/constants'
import type { ISODate } from '@/lib/dates'
import { parseEurInput, toCents } from '@/lib/format'
import { useSaveLimits, type WeekLimit } from './api'

/** Manual week limits (until import brings them from Excel, and for later corrections). */
export function LimitsSheet({
  open,
  onClose,
  monday,
  current,
}: {
  open: boolean
  onClose: () => void
  monday: ISODate
  current: readonly WeekLimit[]
}) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Лимиты недели">
      {open && <LimitsForm monday={monday} current={current} onDone={onClose} />}
    </BottomSheet>
  )
}

function LimitsForm({ monday, current, onDone }: { monday: ISODate; current: readonly WeekLimit[]; onDone: () => void }) {
  const save = useSaveLimits()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      WEEK_CATEGORIES.map((c) => {
        const l = current.find((x) => x.category === c)
        return [c, l ? String(toCents(l.limit_eur) / 100).replace('.', ',') : '']
      }),
    ),
  )
  const parsed = Object.fromEntries(WEEK_CATEGORIES.map((c) => [c, values[c]?.trim() ? parseEurInput(values[c]!) : 0]))
  const invalid = Object.values(parsed).some((v) => v === null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (invalid) return
    save.mutate({ monday, limits: parsed as Record<WeekCategory, number> }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {WEEK_CATEGORIES.map((c) => (
        <label key={c} className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-base">{c}</span>
          <input
            inputMode="decimal"
            value={values[c]}
            onChange={(e) => setValues({ ...values, [c]: e.target.value })}
            aria-invalid={parsed[c] === null}
            className="h-12 w-28 rounded-xl border border-line2 bg-card px-3 text-right text-base text-ink tabular-nums outline-none focus:border-ink2 aria-invalid:border-amber"
            placeholder="0"
          />
          <span className="text-base text-ink2">€</span>
        </label>
      ))}
      {save.isError && <p className="m-0 text-cap font-semibold text-amber-ink">Не сохранилось. Попробуй ещё раз.</p>}
      <Button type="submit" disabled={invalid || save.isPending}>
        Сохранить
      </Button>
    </form>
  )
}
