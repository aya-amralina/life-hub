import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { formatEur, parseEurInput } from '@/lib/format'
import { envelopeSummary } from '@/lib/rules/money'
import { useAllTransactions, useCreateEnvelope, useEnvelopes } from './api'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'

/** Конверты (design 3l, rule 4): put aside / spent / left, outside the weekly limit. */
export function EnvelopesTab() {
  const envelopes = useEnvelopes()
  const txs = useAllTransactions()
  const [adding, setAdding] = useState(false)
  if (envelopes.isPending || txs.isPending) return <SkeletonCard />
  const list = (envelopes.data ?? []).map((e) => ({ e, s: envelopeSummary(e, txs.data ?? []) }))
  const planned = list.reduce((s, x) => s + x.s.plannedCents, 0)
  const spent = list.reduce((s, x) => s + x.s.spentCents, 0)
  const left = list.reduce((s, x) => s + x.s.leftCents, 0)

  return (
    <>
      {list.length === 0 ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-line2 p-4">
          <div className="text-base font-semibold">Конвертов пока нет</div>
          <p className="m-0 text-cap text-ink2">Отложи на цель — подарки, поездку, куртку. Деньги остаются на счёте, просто с пометкой.</p>
          <Button onClick={() => setAdding(true)} icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}>
            Первый конверт
          </Button>
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-cap text-ink2">Отложено в конвертах</span>
            <span className="text-big font-semibold tabular-nums">{formatEur(planned, { whole: true })}</span>
            <span className="text-cap text-ink2 tabular-nums">
              потрачено {formatEur(spent, { whole: true })} · осталось {formatEur(left, { whole: true })}
            </span>
          </div>
          {list.map(({ e, s }) => (
            <Card key={e.id}>
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 text-base font-semibold [overflow-wrap:anywhere]">{e.name}</span>
                <span className="text-cap text-ink2 tabular-nums">
                  осталось <span className="font-semibold text-ink">{formatEur(s.leftCents, { whole: true })}</span>
                </span>
              </div>
              <ProgressBar value={s.spentCents} max={s.plannedCents} fillClass="bg-money" label={e.name} />
              <div className="text-cap text-ink2 tabular-nums">
                {[`заложено ${formatEur(s.plannedCents, { whole: true })}`, `потрачено ${formatEur(s.spentCents, { whole: true })}`, e.when_text].filter(Boolean).join(' · ')}
              </div>
              {s.overCents > 0 && <div className="text-cap font-semibold text-amber-ink tabular-nums">+{formatEur(s.overCents, { whole: true })} сверх</div>}
            </Card>
          ))}
          <Button variant="secondary" onClick={() => setAdding(true)} icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}>
            Новый конверт
          </Button>
        </>
      )}
      <EnvelopeSheet open={adding} onClose={() => setAdding(false)} />
    </>
  )
}

function EnvelopeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [when, setWhen] = useState('')
  const [type, setType] = useState<'envelope' | 'pot'>('envelope')
  const create = useCreateEnvelope()
  const toast = useToast()
  const cents = parseEurInput(amount)
  return (
    <BottomSheet open={open} onClose={onClose} label="Новый конверт">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          create.mutate(
            { name: name.trim(), type, planned_eur: cents === null ? null : cents / 100, when_text: when.trim() || null },
            {
              onSuccess: () => {
                toast({ text: `Конверт «${name.trim()}» готов` })
                setName('')
                setAmount('')
                setWhen('')
                onClose()
              },
            },
          )
        }}
      >
        <SegmentedTabs
          label="Вид"
          segments={[
            { value: 'envelope', label: 'Конверт' },
            { value: 'pot', label: 'Копилка' },
          ]}
          value={type}
          onChange={setType}
        />
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="На что" aria-label="Название" className={field} />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Сколько заложить, €" aria-label="Сумма" className={field} />
        <input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Когда, например «до 20.12»" aria-label="Когда" className={field} />
        <Button type="submit" disabled={!name.trim() || (amount !== '' && cents === null) || create.isPending}>
          Сохранить
        </Button>
      </form>
    </BottomSheet>
  )
}
