import { useState } from 'react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { formatDayMonth, todayBerlin } from '@/lib/dates'
import { formatAmount, formatEur, parseEurInput } from '@/lib/format'
import { accountOptions, accountsProblem } from '@/lib/rules/accounts'
import { forecastEnd } from '@/lib/rules/money'
import { OPERATION_GROUPS, OPERATION_KIND_LABEL, type OperationKind } from '@/lib/rules/operation'
import { type Freq } from '@/lib/rules/recurring'
import {
  FREQ_LABEL,
  anchorForRhythm,
  blankRecurring,
  describeRule,
  lastAnswered,
  linkCandidates,
  planRuleSave,
  recurringForm,
  recurringRow,
  recurringValid,
  scheduleWarning,
  suggestedAnchor,
  type RecurringForm,
} from '@/lib/rules/recurringEdit'
import { useAccounts, useEnvelopes, useSaveRecurring, type Recurring, type RecurringStep, type Transaction } from './api'
import { Choice } from './Choice'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none placeholder:text-ink3 focus:border-ink2'
const KINDS = (Object.keys(OPERATION_KIND_LABEL) as OperationKind[]).map((value) => ({ value, label: OPERATION_KIND_LABEL[value] }))
const FREQS = (Object.keys(FREQ_LABEL) as Freq[]).map((value) => ({ value, label: FREQ_LABEL[value] }))

/**
 * A recurring operation — new or existing (decision 16.11.2026). Name, sum, kind, group, account, envelope, note
 * and the pause change in place. The schedule too, while no occurrence has an answer; after that a new schedule
 * closes the old rule and starts a new one after the last answer (correction C). `initial` prefills a new rule;
 * `onCreated` gets a new rule once it is saved.
 */
export function RecurringSheet({
  open,
  onClose,
  rule,
  txs,
  initial,
  onCreated,
  onLink,
  linkTxId,
}: {
  open: boolean
  onClose: () => void
  rule: Recurring | null
  txs: readonly Transaction[]
  initial?: RecurringForm
  onCreated?: (rule: Recurring) => void
  /** «Уже есть в плане · N» of an existing rule */
  onLink?: (rule: Recurring) => void
  /** «Сделать регулярным»: this operation becomes the new rule's first occurrence */
  linkTxId?: string
}) {
  return (
    <BottomSheet open={open} onClose={onClose} label={rule ? 'Регулярный платёж' : 'Новый регулярный платёж'}>
      {open && <RecurringFormBody key={rule?.id ?? 'new'} rule={rule} txs={txs} initial={initial} onClose={onClose} onCreated={onCreated} onLink={onLink} linkTxId={linkTxId} />}
    </BottomSheet>
  )
}

function RecurringFormBody({
  rule,
  txs,
  initial,
  onClose,
  onCreated,
  onLink,
  linkTxId,
}: {
  rule: Recurring | null
  txs: readonly Transaction[]
  initial?: RecurringForm
  onClose: () => void
  onCreated?: (rule: Recurring) => void
  onLink?: (rule: Recurring) => void
  linkTxId?: string
}) {
  const [f, setF] = useState<RecurringForm>(() => (rule ? recurringForm(rule) : (initial ?? blankRecurring(todayBerlin()))))
  const [amount, setAmount] = useState(() => {
    const c = rule ? Math.round(Number(rule.amount_eur) * 100) : (initial?.cents ?? null)
    return c === null ? '' : formatAmount(c, { whole: true })
  })
  const [every, setEvery] = useState(String(f.interval))
  // the first date was moved past the last answer by the form itself (not typed): undone when the schedule is back
  const [autoAnchor, setAutoAnchor] = useState(false)
  const envelopes = useEnvelopes()
  const accounts = useAccounts()
  const save = useSaveRecurring()
  const toast = useToast()
  const set = (p: Partial<RecurringForm>) => setF((old) => ({ ...old, ...p }))

  const answered = rule ? lastAnswered(rule.id, txs) : null
  const interval = /^\d+$/.test(every.trim()) ? Number(every.trim()) : 0
  const accountList = accounts.data ?? []
  // a new rule starts from Revolut · Основной, as a new operation; an existing one keeps what it has (none = «Баланс»)
  const mainId = accountList.find((a) => a.source_id === 'acct:revolut-main')?.id ?? null
  const form: RecurringForm = { ...f, accountId: f.accountId ?? (rule ? null : mainId), cents: parseEurInput(amount), interval }
  // every occurrence is ahead of the start by accounts: always checked (decision 18.11.2026)
  const problem = accountsProblem({ kind: form.kind, date: form.anchor, account_id: form.accountId, to_account_id: form.kind === 'transfer' ? form.toAccountId : null }, accountList, null)
  const plan = rule ? planRuleSave(rule, form, txs) : null
  const warning = rule ? scheduleWarning(rule, form, txs) : null
  const split = plan?.mode === 'split'
  const valid = recurringValid(form) && plan?.mode !== 'invalid' && problem === null
  const similar = rule && onLink ? linkCandidates(rule, txs, forecastEnd(todayBerlin())).length : 0
  const pots = (envelopes.data ?? []).filter((e) => e.type === 'envelope' || e.id === f.envelopeId)

  // a new frequency or interval after answers starts, by default, in the old schedule's next period after the last answer
  const setSchedule = (p: { freq?: Freq; every?: string }) => {
    const nextEvery = p.every ?? every
    const nextInterval = /^\d+$/.test(nextEvery.trim()) ? Number(nextEvery.trim()) : interval
    if (p.every !== undefined) setEvery(p.every)
    const freq = p.freq ?? f.freq
    if (!rule) return set({ freq })
    const a = anchorForRhythm(rule, txs, { freq, interval: nextInterval, anchor: f.anchor }, autoAnchor)
    setAutoAnchor(a.auto)
    set({ freq, anchor: a.anchor })
  }

  const submit = () => {
    if (!valid) return
    const sum = formatEur(form.cents!, { whole: true })
    const row = recurringRow(form)
    if (!rule || !plan) {
      const id = crypto.randomUUID()
      save.mutate({ steps: [{ action: 'insert', values: { id, ...row } }], links: linkTxId ? [{ txId: linkTxId, recurringId: id, occurrence: row.anchor_date }] : [] })
      toast({ text: `${row.title} · ${sum} — ${describeRule(row)}` })
      onClose()
      onCreated?.({ ...row, id, source_id: null, user_id: '', created_at: '', updated_at: '' })
      return
    }
    let steps: RecurringStep[] = []
    if (plan.mode === 'in_place') steps = [{ action: 'update', id: plan.id, values: plan.row }]
    if (plan.mode === 'split') {
      steps = [
        { action: 'update', id: plan.close.id, values: { end_date: plan.close.end_date } },
        { action: 'insert', values: { id: crypto.randomUUID(), ...plan.create } },
      ]
    }
    save.mutate({ steps })
    toast({ text: plan.mode === 'split' ? `${row.title}: новое расписание с ${formatDayMonth(row.anchor_date)}` : `${row.title} · ${sum} — сохранено` })
    onClose()
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <SegmentedTabs label="Вид" segments={KINDS} value={f.kind} onChange={(kind) => set({ kind })} />
      <input autoFocus={!rule && !initial} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Название, например Miete" aria-label="Название" lang="de" className={field} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-2">
          <span className="text-cap text-ink2">Сумма, €</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Сумма" className={`${field} tabular-nums`} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-cap text-ink2">{split ? 'Новое — с' : 'Первая дата'}</span>
          <input
            type="date"
            value={f.anchor}
            onChange={(e) => {
              if (!e.target.value) return
              set({ anchor: e.target.value })
              setAutoAnchor(false)
            }}
            aria-label="Первая дата"
            className={field}
          />
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <SegmentedTabs label="Повтор" segments={FREQS} value={f.freq} onChange={(freq) => setSchedule({ freq })} />
        <label className="flex items-center gap-3">
          <span className="text-base">Каждые</span>
          <input
            value={every}
            onChange={(e) => setSchedule({ every: e.target.value })}
            inputMode="numeric"
            aria-label="Интервал"
            className="h-12 w-20 rounded-xl border border-line2 bg-card px-4 text-center text-base text-ink tabular-nums outline-none focus:border-ink2"
          />
        </label>
        <span className="text-cap text-ink2">{interval > 0 ? describeRule({ freq: f.freq, interval_n: interval, anchor_date: f.anchor }) : 'Интервал — целое число, 1 и больше.'}</span>
        {plan?.mode === 'invalid' && (
          <span className="flex flex-wrap items-center gap-2 text-cap font-semibold text-ink">
            {plan.reason}
            <Button variant="secondary" className="h-11" onClick={() => set({ anchor: suggestedAnchor(rule!, txs) })}>
              С {formatDayMonth(suggestedAnchor(rule!, txs))}
            </Button>
          </span>
        )}
        {split && answered && <span className="text-cap text-ink2">Ответы до {formatDayMonth(answered)} остаются при старом расписании, новое начнётся {formatDayMonth(f.anchor)}.</span>}
        {warning && <span className="text-cap font-semibold text-ink">{warning}</span>}
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-cap text-ink2">Последняя дата, если есть</span>
        <input type="date" value={f.end ?? ''} onChange={(e) => set({ end: e.target.value || null })} aria-label="Последняя дата" className={field} />
      </label>
      {f.kind === 'expense' && <Choice label="Группа" options={OPERATION_GROUPS.map((g) => ({ value: g, label: g }))} value={f.grp} onChange={(grp) => set({ grp })} />}
      <Choice
        label={f.kind === 'income' ? 'Куда' : f.kind === 'transfer' ? 'Откуда' : 'Откуда — только счета «Баланса»'}
        options={accountOptions(accountList, { group: f.kind === 'expense' ? 'balance' : undefined, keep: form.accountId }).map((a) => ({ value: a.id, label: a.name }))}
        value={form.accountId}
        onChange={(accountId) => set({ accountId })}
      />
      {f.kind === 'transfer' && (
        <Choice
          label="Куда"
          options={accountOptions(accountList, { keep: f.toAccountId })
            .filter((a) => a.id !== form.accountId)
            .map((a) => ({ value: a.id, label: a.name }))}
          value={f.toAccountId}
          onChange={(toAccountId) => set({ toAccountId })}
        />
      )}
      {problem && <p className="m-0 text-cap font-semibold text-amber-ink">{problem}</p>}
      {f.kind === 'expense' && pots.length > 0 && (
        <Choice label="Из конверта" options={pots.map((e) => ({ value: e.id, label: e.name }))} value={f.envelopeId} onChange={(envelopeId) => set({ envelopeId })} />
      )}
      <input value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Заметка" aria-label="Заметка" className={field} />
      <Button type="submit" disabled={!valid}>
        Сохранить
      </Button>
      {rule && similar > 0 && (
        <Button variant="secondary" onClick={() => onLink?.(rule)}>
          Уже есть в плане · {similar}
        </Button>
      )}
      {rule && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="h-11"
            onClick={() => {
              save.mutate({ steps: [{ action: 'update', id: rule.id, values: { active: !rule.active } }] })
              toast({
                text: rule.active ? `${rule.title} — на паузе, в плане его нет` : `${rule.title} — снова в плане`,
                actionLabel: 'Вернуть',
                onAction: () => save.mutate({ steps: [{ action: 'update', id: rule.id, values: { active: rule.active } }] }),
              })
              onClose()
            }}
          >
            {rule.active ? 'Пауза' : 'Снять с паузы'}
          </Button>
          {answered === null ? (
            <Button
              variant="quiet"
              onClick={() => {
                save.mutate({ steps: [{ action: 'delete', id: rule.id }] })
                toast({ text: `${rule.title} — удалено` })
                onClose()
              }}
            >
              Удалить
            </Button>
          ) : (
            <span className="flex items-center text-cap text-ink2">Есть ответы — чтобы закончить, поставь последнюю дату.</span>
          )}
        </div>
      )}
    </form>
  )
}

