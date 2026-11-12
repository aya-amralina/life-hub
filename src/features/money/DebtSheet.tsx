import { useState } from 'react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { formatAmount, formatEur, parseEurInput } from '@/lib/format'
import { DEBT_DIRECTION_LABEL, debtRow, debtValid, type DebtDirection, type DebtForm } from '@/lib/rules/operation'
import { useDeleteDebt, useSaveDebt, type Debt, type Envelope } from './api'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none placeholder:text-ink3 focus:border-ink2'
const DIRECTIONS = Object.keys(DEBT_DIRECTION_LABEL) as DebtDirection[]
const cents = (v: number | null) => (v === null ? '' : formatAmount(Math.round(Number(v) * 100), { whole: true }))

/** A debt — new or existing: who, direction, sum, what is already back, due date; close / reopen; delete. */
export function DebtSheet({ open, onClose, debt, goals }: { open: boolean; onClose: () => void; debt: Debt | null; goals: Envelope[] }) {
  return (
    <BottomSheet open={open} onClose={onClose} label={debt ? 'Долг' : 'Новый долг'}>
      {open && <DebtFormBody key={debt?.id ?? 'new'} debt={debt} goals={goals} onClose={onClose} />}
    </BottomSheet>
  )
}

function DebtFormBody({ debt, goals, onClose }: { debt: Debt | null; goals: Envelope[]; onClose: () => void }) {
  const [who, setWho] = useState(debt?.who ?? '')
  const [direction, setDirection] = useState<DebtDirection>((debt?.direction as DebtDirection) ?? 'i_owe')
  const [amount, setAmount] = useState(cents(debt?.amount_eur ?? null))
  const [repaid, setRepaid] = useState(cents(debt?.repaid_eur ?? null))
  const [due, setDue] = useState(debt?.due_date ?? '')
  const [potId, setPotId] = useState<string | null>(debt?.pot_id ?? null)
  const [note, setNote] = useState(debt?.note ?? '')
  const save = useSaveDebt()
  const del = useDeleteDebt()
  const toast = useToast()
  const form: DebtForm = { who, direction, cents: parseEurInput(amount), repaidCents: repaid.trim() === '' ? null : parseEurInput(repaid), due: due || null, potId, note }
  const valid = debtValid(form) && (repaid.trim() === '' || form.repaidCents !== null)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        save.mutate({ id: debt?.id ?? null, values: debtRow(form) }, { onSuccess: () => toast({ text: `${who.trim()} · ${formatEur(form.cents!, { whole: true })} — ${debt ? 'сохранено' : 'долг записан'}` }) })
        onClose()
      }}
    >
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-cap text-ink2">Кто кому</legend>
        <div className="flex flex-wrap gap-2">
          {DIRECTIONS.map((d) => (
            <Chip key={d} selected={direction === d} onClick={() => setDirection(d)} disabled={d === 'from_pot' && goals.length === 0}>
              {DEBT_DIRECTION_LABEL[d]}
            </Chip>
          ))}
        </div>
      </fieldset>
      <input autoFocus={!debt} value={who} onChange={(e) => setWho(e.target.value)} placeholder={direction === 'from_pot' ? 'На что взяла' : 'Кто'} aria-label="Кто" className={field} />
      {direction === 'from_pot' && (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-cap text-ink2">Из какой цели взято</legend>
          <div className="flex flex-wrap gap-2">
            {goals.map((g) => (
              <Chip key={g.id} selected={potId === g.id} onClick={() => setPotId(g.id)}>
                {g.name}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-2">
          <span className="text-cap text-ink2">Сумма, €</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Сумма долга" className={`${field} tabular-nums`} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-cap text-ink2">Уже возвращено, €</span>
          <input value={repaid} onChange={(e) => setRepaid(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Уже возвращено" className={`${field} tabular-nums`} />
        </label>
      </div>
      <p className="m-0 text-cap text-ink2">Если к долгу привязаны операции со статусом «факт», возвращённое считается по ним.</p>
      <label className="flex flex-col gap-2">
        <span className="text-cap text-ink2">Срок, если есть</span>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Срок" className={field} />
      </label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Заметка" aria-label="Заметка" className={field} />
      <Button type="submit" disabled={!valid}>
        Сохранить
      </Button>
      {debt && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="h-11"
            onClick={() => {
              const status = debt.status === 'open' ? 'closed' : 'open'
              save.mutate({ id: debt.id, values: { status } })
              toast({ text: status === 'closed' ? `${debt.who} — долг закрыт` : `${debt.who} — снова открыт`, actionLabel: 'Вернуть', onAction: () => save.mutate({ id: debt.id, values: { status: debt.status } }) })
              onClose()
            }}
          >
            {debt.status === 'open' ? 'Закрыть долг' : 'Открыть снова'}
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              del.mutate(debt.id)
              toast({ text: `${debt.who} — долг удалён` })
              onClose()
            }}
          >
            Удалить
          </Button>
        </div>
      )}
    </form>
  )
}
