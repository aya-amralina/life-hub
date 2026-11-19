import { useState } from 'react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { formatDayMonth, todayBerlin } from '@/lib/dates'
import { formatEur, parseEurInput } from '@/lib/format'
import { accountOptions } from '@/lib/rules/accounts'
import { periodMonths, periodName, periodStart } from '@/lib/rules/periods'
import type { PlannedItem } from '@/lib/rules/plan'
import { Choice } from './Choice'
import { useAccounts, useCreateEnvelope, useEnvelopes, useClosedEnvelopes, useMovePlanItem, usePaydays, usePlanTransactions, useRecurring, useUpdateEnvelope } from './api'
import { useAddWish, useUpdateWish, useWishlist } from './wishlistApi'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'
const SOMEDAY = 'someday'
const eur = (c: number) => formatEur(c, { whole: true })
const amountText = (c: number) => (c === 0 ? '' : String(c / 100).replace('.', ','))

/**
 * One form for a planned spending (docs/money-redesign.md, phase 3): new, an envelope or a wish. «Из каких денег» moves
 * it to another period or to «Когда-нибудь» (a wish ↔ an envelope underneath — one item, never two). «Закрыть» ends an
 * envelope: what is left goes back into «свободно» at once (decision 20.11.2026). Debts and operations keep their sheets.
 */
export function PlanItemSheet({ open, onClose, item }: { open: boolean; onClose: () => void; item: PlannedItem | null }) {
  return (
    <BottomSheet open={open} onClose={onClose} label={item ? item.title : 'Новая трата в план'}>
      {open && <PlanItemForm key={item?.key ?? 'new'} item={item} onClose={onClose} />}
    </BottomSheet>
  )
}

function PlanItemForm({ item, onClose }: { item: PlannedItem | null; onClose: () => void }) {
  const today = todayBerlin()
  const paydays = usePaydays() ?? []
  const months = periodMonths(today, paydays)
  const envelopes = useEnvelopes()
  const closed = useClosedEnvelopes()
  const wishes = useWishlist()
  const txs = usePlanTransactions()
  const rules = useRecurring()
  const accounts = useAccounts()
  const create = useCreateEnvelope()
  const update = useUpdateEnvelope()
  const addWish = useAddWish()
  const updateWish = useUpdateWish()
  const move = useMovePlanItem()
  const toast = useToast()

  const env = item?.source === 'envelope' ? [...(envelopes.data ?? []), ...(closed.data ?? [])].find((e) => e.id === item.sourceId) : undefined
  const wish = item?.source === 'wish' ? (wishes.data ?? []).find((w) => w.id === item.sourceId) : undefined
  const accountList = accounts.data ?? []
  const main = accountList.find((a) => a.source_id === 'acct:revolut-main')?.id ?? null

  const [title, setTitle] = useState(item?.title ?? '')
  const [amount, setAmount] = useState(amountText(item?.amountCents ?? 0))
  const [when, setWhen] = useState(env?.when_text ?? '')
  const [accountId, setAccountId] = useState<string | null>(env ? env.account_id : main)
  const [period, setPeriod] = useState<string>(() => {
    if (item?.source === 'wish') return SOMEDAY
    const m = item?.month
    return m && m >= months[0]! ? m : months[0]!
  })
  const [early, setEarly] = useState(env?.reserved_early ?? false)

  const cents = parseEurInput(amount)
  const someday = period === SOMEDAY
  const future = !someday && today < periodStart(period, paydays)
  // an envelope goes to «Когда-нибудь» only while nothing points at it (operations, rules)
  const linked = !!env && ((txs.data ?? []).some((t) => t.envelope_id === env.id) || (rules.data ?? []).some((r) => r.envelope_id === env.id))
  const valid = title.trim() !== '' && (amount === '' || cents !== null) && !(someday && linked)
  const busy = create.isPending || update.isPending || addWish.isPending || move.isPending

  const options = [
    { value: SOMEDAY, label: 'Когда-нибудь' },
    ...(months.includes(period) || someday ? months : [...months, period]).map((m) => ({ value: m, label: periodName(m, today) })),
  ]

  const envelopeValues = () => ({
    name: title.trim(),
    type: 'envelope',
    planned_eur: cents === null ? null : cents / 100,
    when_text: when.trim() || null,
    pay_month: `${period}-01`,
    reserved_early: future && early,
    account_id: accountId,
  })
  const done = (text: string) => {
    toast({ text })
    onClose()
  }

  const save = () => {
    if (!valid) return
    const name = title.trim()
    const price = cents === null ? null : cents / 100
    const where = someday ? 'Когда-нибудь' : periodName(period, today)
    if (!item) {
      if (someday) addWish.mutate({ title: name, price_eur: price, decision: 'buy', decided_at: new Date().toISOString() }, { onSuccess: () => done(`«${name}» — когда-нибудь`) })
      else create.mutate(envelopeValues(), { onSuccess: () => done(`«${name}» — в плане, ${where}`) })
      return
    }
    if (wish) {
      if (someday) updateWish.mutate({ id: wish.id, patch: { title: name, price_eur: price } }, { onSuccess: () => done(`«${name}» — сохранено`) })
      else move.mutate({ to: 'period', wishId: wish.id, envelope: envelopeValues() }, { onSuccess: () => done(`«${name}» — в плане, ${where}`) })
      return
    }
    if (env) {
      if (someday) move.mutate({ to: 'someday', envelopeId: env.id, wish: { title: name, price_eur: price } }, { onSuccess: () => done(`«${name}» — когда-нибудь`) })
      else update.mutate({ id: env.id, patch: envelopeValues() }, { onSuccess: () => done(`«${name}» — ${where}`) })
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <input autoFocus={!item} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="На что" aria-label="Название" className={field} />
      <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Сколько, €" aria-label="Сумма" className={field} />
      <Choice label="Из каких денег" options={options} value={period} onChange={(v) => v && setPeriod(v)} />
      {someday && linked && <p className="m-0 text-cap font-semibold text-amber-ink">К этой трате уже привязаны операции — её можно перенести в другой месяц, но не в «Когда-нибудь».</p>}
      {!someday && (
        <>
          <input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Когда, если важно: «конец декабря»" aria-label="Когда" className={field} />
          <Choice label="Где лежат деньги" options={accountOptions(accountList, { keep: accountId }).map((a) => ({ value: a.id, label: a.name }))} value={accountId} onChange={setAccountId} />
          {future && (
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 text-base">
                Отложить сейчас
                <span className="block text-cap text-ink2">
                  {early ? 'Из сегодняшних денег — «Свободно» станет меньше уже сейчас.' : `Отложится в день денег, ${formatDayMonth(periodStart(period, paydays))}.`}
                </span>
              </span>
              <Switch checked={early} onChange={setEarly} label="Отложить сейчас" />
            </div>
          )}
        </>
      )}
      <Button type="submit" disabled={!valid || busy}>
        Сохранить
      </Button>
      {env && !env.archived && (
        <Button
          variant="quiet"
          onClick={() => {
            update.mutate({ id: env.id, patch: { archived: true } })
            const left = item!.leftCents
            toast({
              text: left > 0 ? `«${env.name}» закрыта — ${eur(left)} вернулись в «свободно»` : `«${env.name}» закрыта`,
              actionLabel: 'Вернуть',
              onAction: () => update.mutate({ id: env.id, patch: { archived: false } }),
            })
            onClose()
          }}
        >
          Закрыть — готово
        </Button>
      )}
      {env?.archived && (
        <Button variant="quiet" onClick={() => update.mutate({ id: env.id, patch: { archived: false } }, { onSuccess: () => done(`«${env.name}» — снова в плане`) })}>
          Открыть снова
        </Button>
      )}
      {wish && (
        <Button
          variant="quiet"
          onClick={() => {
            updateWish.mutate({ id: wish.id, patch: { decision: 'skip', decided_at: new Date().toISOString() } })
            toast({ text: `«${wish.title}» — не покупаем`, actionLabel: 'Вернуть', onAction: () => updateWish.mutate({ id: wish.id, patch: { decision: wish.decision, decided_at: wish.decided_at } }) })
            onClose()
          }}
        >
          Не покупать
        </Button>
      )}
    </form>
  )
}
