import { useState } from 'react'
import { Check } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { formatDayMonth, todayBerlin } from '@/lib/dates'
import { formatEur, plural, toCents } from '@/lib/format'
import { forecastEnd, isFact, signedCents } from '@/lib/rules/money'
import { linkCandidates } from '@/lib/rules/recurring'
import { useSaveRecurring, type Recurring, type Transaction } from './api'

/**
 * «Уже есть в плане» (decision 16.11.2026): operations already in the base that look like occurrences of the
 * rule. Without a link they would count twice — the row and the rule's occurrence. All are ticked; nothing is
 * written until «Привязать N».
 */
export function RecurringLinkSheet({ rule, txs, onClose }: { rule: Recurring | null; txs: readonly Transaction[]; onClose: () => void }) {
  return (
    <BottomSheet open={rule !== null} onClose={onClose} label="Уже есть в плане">
      {rule && <LinkBody key={rule.id} rule={rule} txs={txs} onClose={onClose} />}
    </BottomSheet>
  )
}

function LinkBody({ rule, txs, onClose }: { rule: Recurring; txs: readonly Transaction[]; onClose: () => void }) {
  // the list is taken once, when the sheet opens: rows linked meanwhile do not jump out of it
  const [candidates] = useState(() => linkCandidates(rule, txs, forecastEnd(todayBerlin())))
  const [picked, setPicked] = useState(() => new Set(candidates.map((c) => c.tx.id)))
  const save = useSaveRecurring()
  const toast = useToast()
  const n = picked.size
  const toggle = (id: string) =>
    setPicked((old) => {
      const next = new Set(old)
      if (!next.delete(id)) next.add(id)
      return next
    })

  if (!candidates.length) {
    return <p className="m-0 text-base text-ink2">Похожих операций нет — привязывать нечего.</p>
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-base">
        Эти операции похожи на повторения <span lang="de">«{rule.title}»</span>. Привяжи их — и в плане они не посчитаются дважды.
      </p>
      <ul className="m-0 flex list-none flex-col p-0">
        {candidates.map(({ tx, occurrence }) => {
          const on = picked.has(tx.id)
          const c = signedCents(tx)
          return (
            <li key={tx.id} className="border-t border-line first:border-t-0">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={`${formatDayMonth(tx.date)} ${tx.title}`}
                onClick={() => toggle(tx.id)}
                className="flex min-h-12 w-full items-center gap-3 py-1 text-left active:bg-sub"
              >
                {on ? (
                  <span className="flex size-6 flex-none items-center justify-center rounded-lg bg-inv text-on-inv">
                    <Check size={16} strokeWidth={2.25} aria-hidden="true" />
                  </span>
                ) : (
                  <span className="size-6 flex-none rounded-lg border-[1.5px] border-line2" />
                )}
                <span className="w-10 flex-none text-cap text-ink2 tabular-nums">{formatDayMonth(tx.date)}</span>
                <span className="min-w-0 flex-1">
                  <span lang="de" className="block text-base [overflow-wrap:anywhere]">
                    {tx.title}
                  </span>
                  <span className="block text-cap text-ink2">
                    {[isFact(tx) ? 'факт' : 'план', tx.date !== occurrence ? `повторение ${formatDayMonth(occurrence)}` : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="text-base tabular-nums">{c > 0 ? `+${formatEur(c, { whole: true })}` : c < 0 ? `−${formatEur(-c, { whole: true })}` : formatEur(toCents(tx.amount_eur), { whole: true })}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <Button
        disabled={n === 0}
        onClick={() => {
          const links = candidates.filter((c) => picked.has(c.tx.id)).map((c) => ({ txId: c.tx.id, recurringId: rule.id, occurrence: c.occurrence }))
          save.mutate({ steps: [], links })
          toast({ text: `${n} ${plural(n, ['операция', 'операции', 'операций'])} — теперь повторения «${rule.title}»` })
          onClose()
        }}
      >
        {n ? `Привязать ${n}` : 'Отметь, что привязать'}
      </Button>
      <Button variant="quiet" onClick={onClose}>
        Не привязывать
      </Button>
    </div>
  )
}
