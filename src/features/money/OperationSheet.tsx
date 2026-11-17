import { useState } from 'react'
import { Repeat } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { ACCOUNTS, WEEK_CATEGORIES } from '@/lib/constants'
import { todayBerlin } from '@/lib/dates'
import { formatAmount, formatEur, parseEurInput } from '@/lib/format'
import { forecastEnd, isWeekRow } from '@/lib/rules/money'
import { DEBT_DIRECTION_LABEL, OPERATION_GROUPS, OPERATION_KIND_LABEL, operationForm, operationRow, operationValid, type DebtDirection, type OperationForm, type OperationKind } from '@/lib/rules/operation'
import { isVirtual, materialize } from '@/lib/rules/recurring'
import { canMakeRecurring, linkCandidates, recurringFromOperation } from '@/lib/rules/recurringEdit'
import { Choice } from './Choice'
import { RecurringLinkSheet } from './RecurringLinkSheet'
import { RecurringSheet } from './RecurringSheet'
import {
  useAllTransactions,
  useAnswerPlanned,
  useCreateTransaction,
  useDebts,
  useDeleteTransaction,
  useEnvelopes,
  useUpdateTransaction,
  type PlanTx,
  type Recurring,
  type Transaction,
} from './api'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none placeholder:text-ink3 focus:border-ink2'
const KINDS = (Object.keys(OPERATION_KIND_LABEL) as OperationKind[]).map((value) => ({ value, label: OPERATION_KIND_LABEL[value] }))
const STATUSES = [
  { value: 'plan', label: 'План' },
  { value: 'fact', label: 'Факт' },
] as const

const blank = (): OperationForm => ({ kind: 'expense', title: '', cents: null, date: todayBerlin(), status: 'plan', grp: 'Обязательное', category: null, account: null, envelopeId: null, debtId: null, note: '' })

/**
 * An operation of the plan — new or existing (the app is the source since 12.11.2026, no Excel behind it).
 * Everything of «Статьи» can be changed: kind, name, sum, date, plan / fact, group, account, envelope, debt, note.
 * A week row («Неделя N») keeps its kind and status — only the sum, the date and the note. «Убрать из плана»
 * keeps the row (it can come back); an operation made in the app can also be deleted.
 * An occurrence of a recurring rule is virtual: saving it or taking it out of the plan makes it a real row
 * answering that occurrence; there is nothing to delete — the rule itself is changed in «Регулярные».
 * «Сделать регулярным» (a stored planned one): the rule sheet, prefilled from the operation; the operation becomes
 * the rule's first occurrence, then the usual «Уже есть в плане» for the similar ones.
 */
export function OperationSheet({ open, onClose, tx }: { open: boolean; onClose: () => void; tx: PlanTx | null }) {
  const all = useAllTransactions()
  const [ruleFrom, setRuleFrom] = useState<Transaction | null>(null)
  const [linking, setLinking] = useState<{ rule: Recurring; txs: Transaction[] } | null>(null)
  const txs = all.data ?? []
  return (
    <>
      <BottomSheet open={open} onClose={onClose} label={tx ? 'Операция' : 'Новая операция'}>
        {/* remount per operation: the form starts from the row it edits */}
        {open && (
          <OperationFormBody
            key={tx?.id ?? 'new'}
            tx={tx}
            onClose={onClose}
            onMakeRecurring={(t) => {
              onClose()
              setRuleFrom(t)
            }}
          />
        )}
      </BottomSheet>
      <RecurringSheet
        open={ruleFrom !== null}
        onClose={() => setRuleFrom(null)}
        rule={null}
        txs={txs}
        initial={ruleFrom ? recurringFromOperation(ruleFrom) : undefined}
        linkTxId={ruleFrom?.id}
        onCreated={(rule) => {
          // the operation already answers the first occurrence: the similar ones are the others
          const after = txs.map((t) => (t.id === ruleFrom?.id ? { ...t, recurring_id: rule.id, occurrence_date: rule.anchor_date } : t))
          if (linkCandidates(rule, after, forecastEnd(todayBerlin())).length) setLinking({ rule, txs: after })
        }}
      />
      <RecurringLinkSheet rule={linking?.rule ?? null} txs={linking?.txs ?? []} onClose={() => setLinking(null)} />
    </>
  )
}

function OperationFormBody({ tx, onClose, onMakeRecurring }: { tx: PlanTx | null; onClose: () => void; onMakeRecurring: (tx: Transaction) => void }) {
  const [f, setF] = useState<OperationForm>(() => (tx ? operationForm(tx) : blank()))
  const [amount, setAmount] = useState(tx ? formatAmount(Math.round(Number(tx.amount_eur) * 100), { whole: true }) : '')
  const envelopes = useEnvelopes()
  const debts = useDebts()
  const create = useCreateTransaction()
  const update = useUpdateTransaction()
  const del = useDeleteTransaction()
  const answer = useAnswerPlanned()
  const toast = useToast()
  const set = (p: Partial<OperationForm>) => setF((old) => ({ ...old, ...p }))
  const week = tx !== null && isWeekRow(tx)
  const form = { ...f, cents: parseEurInput(amount) }
  const valid = operationValid(form)
  // only envelopes hold money for spending; a goal is a pocket, not a source of an expense
  const pots = (envelopes.data ?? []).filter((e) => e.type === 'envelope' || e.id === f.envelopeId)
  const openDebts = (debts.data ?? []).filter((d) => d.status === 'open' || d.id === f.debtId)

  const save = () => {
    if (!valid) return
    const row = operationRow(form, tx, new Date().toISOString())
    const sum = formatEur(form.cents!, { whole: true })
    if (tx && isVirtual(tx)) {
      create.mutate(materialize(tx, crypto.randomUUID(), row) as Parameters<typeof create.mutate>[0])
      toast({ text: `${row.title} · ${sum} — сохранено` })
    } else if (tx) {
      // a week row changes only what its form shows
      update.mutate({ id: tx.id, patch: week ? { amount_eur: row.amount_eur, date: row.date, note: row.note } : row })
      toast({ text: `${row.title} · ${sum} — сохранено` })
    } else {
      create.mutate({ id: crypto.randomUUID(), ...row })
      toast({ text: `${row.title} · ${sum} — ${row.is_planned ? 'в плане' : 'записано'}` })
    }
    onClose()
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      {week ? (
        <p lang="de" className="m-0 text-base font-semibold [overflow-wrap:anywhere]">
          {tx.title}
          <span className="block text-cap font-normal text-ink2">{tx.entry_kind === 'week_budget' ? 'бюджет недели — план трат, не одно списание' : 'итог недели'}</span>
        </p>
      ) : (
        <>
          <SegmentedTabs label="Вид" segments={KINDS} value={f.kind} onChange={(kind) => set({ kind })} />
          <input autoFocus={!tx} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Название, например Miete" aria-label="Название" lang="de" className={field} />
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-2">
          <span className="text-cap text-ink2">Сумма, €</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Сумма" className={`${field} tabular-nums`} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-cap text-ink2">Дата</span>
          <input type="date" value={f.date} onChange={(e) => e.target.value && set({ date: e.target.value })} aria-label="Дата" className={field} />
        </label>
      </div>
      {!week && (
        <>
          <div className="flex flex-col gap-2">
            <SegmentedTabs label="Статус" segments={STATUSES} value={f.status} onChange={(status) => set({ status })} />
            <span className="text-cap text-ink2">
              {f.status === 'plan' ? `Ожидается. В свой день спрошу «${f.kind === 'income' ? 'Пришло?' : 'Списалось?'}».` : 'Уже прошло по счёту — входит в «сейчас».'}
            </span>
          </div>
          {f.kind === 'expense' && (
            <Choice label="Группа" options={OPERATION_GROUPS.map((g) => ({ value: g, label: g }))} value={f.grp} onChange={(grp) => set({ grp })} />
          )}
          {f.kind === 'expense' && f.grp === 'Жизнь' && (
            <Choice
              label="Категория недели — трата пойдёт в лимит"
              options={WEEK_CATEGORIES.map((c) => ({ value: c, label: c }))}
              value={f.category}
              onChange={(category) => set({ category })}
            />
          )}
          <Choice label="Счёт" options={ACCOUNTS.map((a) => ({ value: a, label: a }))} value={f.account} onChange={(account) => set({ account })} />
          {f.kind === 'expense' && pots.length > 0 && (
            <Choice
              label="Из конверта — не входит в лимит недели"
              options={pots.map((e) => ({ value: e.id, label: e.name }))}
              value={f.envelopeId}
              onChange={(envelopeId) => set({ envelopeId })}
            />
          )}
          {openDebts.length > 0 && (
            <Choice
              label="Долг — эта операция его гасит или возвращает"
              options={openDebts.map((d) => ({ value: d.id, label: `${d.who} · ${DEBT_DIRECTION_LABEL[d.direction as DebtDirection] ?? d.direction}` }))}
              value={f.debtId}
              onChange={(debtId) => set({ debtId })}
            />
          )}
        </>
      )}
      <input value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Заметка" aria-label="Заметка" className={field} />
      <Button type="submit" disabled={!valid}>
        Сохранить
      </Button>
      {tx && !isVirtual(tx) && canMakeRecurring(tx) && (
        <Button variant="secondary" icon={<Repeat size={20} strokeWidth={1.75} aria-hidden="true" />} onClick={() => onMakeRecurring(tx)}>
          Сделать регулярным
        </Button>
      )}
      {tx && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="h-11"
            onClick={() => {
              const cancelled = tx.cancelled_at ? null : new Date().toISOString()
              toast({
                text: cancelled ? `${tx.title} — убрала из плана` : `${tx.title} — снова в плане`,
                actionLabel: 'Вернуть',
                onAction: answer(tx, { cancelled_at: cancelled }, { cancelled_at: tx.cancelled_at }),
              })
              onClose()
            }}
          >
            {tx.cancelled_at ? 'Вернуть в план' : 'Убрать из плана'}
          </Button>
          {isVirtual(tx) ? (
            <span className="flex items-center text-cap text-ink2">Повторение регулярного платежа — само правило меняется в «Регулярных».</span>
          ) : tx.source_id === null ? (
            <Button
              variant="quiet"
              onClick={() => {
                del.mutate(tx.id)
                toast({ text: `${tx.title} — удалено` })
                onClose()
              }}
            >
              Удалить
            </Button>
          ) : (
            <span className="flex items-center text-cap text-ink2">Строка из старой таблицы — не удаляется, только убирается из плана.</span>
          )}
        </div>
      )}
    </form>
  )
}
