import { useState } from 'react'
import { HandCoins, Pencil, PiggyBank, Plus } from 'lucide-react'
import { useAddAction } from '@/app/addSheetContext'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { MetaChip } from '@/components/ui/MetaChip'
import { PickSheet } from '@/components/ui/PickSheet'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { Switch } from '@/components/ui/Switch'
import { formatDayMonth, formatWeekdayDate, todayBerlin } from '@/lib/dates'
import { formatEstimate, formatEur, joinRu, parseEurInput, plural } from '@/lib/format'
import { accountOptions, goalAccountNow, goalAccountProblem } from '@/lib/rules/accounts'
import { goalForecast } from '@/lib/rules/forecast'
import { debtSummary, envelopeSummary, goalProgress } from '@/lib/rules/money'
import { ENVELOPE_STATUS_LABEL, currentPeriodMonth, envelopeStatus, periodMonths, periodName, periodStart, type EnvelopeStatus } from '@/lib/rules/periods'
import { Choice } from './Choice'
import { DebtSheet } from './DebtSheet'
import { useAccounts, useActualBalances, useAllTransactions, useCreateEnvelope, useDebts, useEnvelopes, usePaydays, usePlannedItems, useSaveGoalBalance, useUpdateEnvelope, type Debt, type Envelope } from './api'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'
const DIRECTION: Record<string, string> = { i_owe: 'я должна', owed_to_me: 'мне должны', from_pot: 'заём из копилки' }
const eur = (c: number) => formatEur(c, { whole: true })

/**
 * Конверты (design 3l, rule 4, docs/EXCEL_FORMAT.md): «Отложено» — what is left in envelopes of type «конверт» that
 * set money aside now (docs/money-redesign.md, phase 1: an envelope of a later period is «Запланировано» until its
 * day of money or «Отложить сейчас»); spent ones fold into «Готово»;
 * goals — now (the latest «Остатки» row of the pocket) against the target, with the due date and what is
 * borrowed from them; debts — open first, closed folded.
 */
export function EnvelopesTab() {
  const envelopes = useEnvelopes()
  const txs = useAllTransactions()
  const debts = useDebts()
  const balances = useActualBalances()
  const accounts = useAccounts()
  const [adding, setAdding] = useState(false)
  const [editingEnv, setEditingEnv] = useState<Envelope | null>(null)
  // the debt sheet: null — closed, 'new' — a new debt, else the one being edited
  const [debtEdit, setDebtEdit] = useState<Debt | 'new' | null>(null)
  const [closedOpen, setClosedOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)
  const paydays = usePaydays()
  const items = usePlannedItems()
  const update = useUpdateEnvelope()
  const toast = useToast()
  useAddAction(() => setPicking(true))
  if (envelopes.isPending || txs.isPending || debts.isPending || balances.isPending || paydays === null || items === null) return <SkeletonCard />
  const all = envelopes.data ?? []
  const tx = txs.data ?? []
  const envs = all.filter((e) => e.type === 'envelope')
  const goals = all.filter((e) => e.type === 'goal')
  const debtList = debts.data ?? []
  const open = debtList.filter((d) => d.status === 'open')
  const closed = debtList.filter((d) => d.status !== 'open')
  const today = todayBerlin()
  // statuses and sums from the plan (phase 2: the screens read the planned items)
  const byKey = new Map(items.map((it) => [it.key, it]))
  const cards = envs.map((e) => {
    const it = byKey.get(`envelope:${e.id}`)
    if (!it) {
      const s = envelopeSummary(e, tx)
      return { e, s, status: envelopeStatus(e, s, today, paydays) }
    }
    const s = { plannedCents: it.amountCents, spentCents: it.spentCents, leftCents: it.leftCents, overCents: Math.max(0, it.spentCents - it.amountCents) }
    return { e, s, status: it.status }
  })
  const now = cards.filter((c) => c.status === 'reserved' || c.status === 'running')
  const later = cards.filter((c) => c.status === 'planned')
  const done = cards.filter((c) => c.status === 'done')
  const left = now.reduce((s, c) => s + c.s.leftCents, 0)
  const spent = now.reduce((s, c) => s + c.s.spentCents, 0)
  const laterCents = later.reduce((s, c) => s + c.s.leftCents, 0)
  const laterMonths = [...new Set(later.map((c) => c.e.pay_month!.slice(0, 7)))].sort().map((m) => periodName(m, today))
  const reserveNow = (e: Envelope) => {
    update.mutate({ id: e.id, patch: { reserved_early: true } })
    toast({ text: `«${e.name}» — отложено сейчас`, actionLabel: 'Вернуть', onAction: () => update.mutate({ id: e.id, patch: { reserved_early: false } }) })
  }
  const card = (c: (typeof cards)[number]) => (
    <EnvelopeCard key={c.e.id} e={c.e} s={c.s} status={c.status} paydays={paydays} onEdit={() => setEditingEnv(c.e)} onReserve={() => reserveNow(c.e)} />
  )

  return (
    <>
      {envs.length === 0 && goals.length === 0 ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-dashed border-line2 p-4">
          <div className="text-base font-semibold">Конвертов пока нет</div>
          <p className="m-0 text-cap text-ink2">Отложи на трату — подарки, поездку, куртку — или заведи цель, к которой копишь. Деньги остаются на счёте, просто с пометкой.</p>
          <Button onClick={() => setAdding(true)} icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}>
            Первый конверт
          </Button>
        </section>
      ) : (
        <>
          {envs.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-cap text-ink2">Отложено в конвертах</span>
              <span className="text-big font-semibold tabular-nums">{eur(left)}</span>
              <span className="text-cap text-ink2 tabular-nums">
                осталось в {now.length} {plural(now.length, ['конверте', 'конвертах', 'конвертах'])} · потрачено {eur(spent)}
              </span>
              {later.length > 0 && (
                <span className="text-cap text-ink2 tabular-nums">
                  ещё {eur(laterCents)} на {joinRu(laterMonths)} — отложится в день денег
                </span>
              )}
            </div>
          )}
          {now.map(card)}
          {later.map(card)}
          {done.length > 0 && (
            <>
              <GroupHeader title="Готово" count={done.length} open={doneOpen} onToggle={() => setDoneOpen(!doneOpen)} />
              {doneOpen && done.map(card)}
            </>
          )}
          {goals.length > 0 && <h2 className="m-0 pt-2 text-title font-semibold">Цели</h2>}
          {goals.map((g) => (
            <GoalCard key={g.id} g={g} p={goalProgress(g, balances.data ?? [], debtList, tx)} onAccount={goalAccountNow(g, goals, accounts.data ?? [], tx, todayBerlin())} forecast={goalForecast(g, { goals, accounts: accounts.data ?? [], txs: tx, balances: balances.data ?? [], today: todayBerlin() })} loans={open.filter((d) => d.direction === 'from_pot' && d.pot_id === g.id)} onEdit={() => setEditingEnv(g)} />
          ))}
        </>
      )}

      <Card>
        <CardHeader title="Долги" dotClass="bg-money" context={debtList.length === 0 ? undefined : open.length ? `открыто ${open.length}` : 'всё закрыто'} />
        {debtList.length === 0 && <p className="m-0 text-cap text-ink2">Долгов нет. Сюда — депозит, который вернёшь, деньги, которые ждёшь, и заём из своей копилки.</p>}
        {open.map((d) => (
          <DebtRow key={d.id} d={d} s={debtSummary(d, tx)} pot={all.find((e) => e.id === d.pot_id)?.name} onEdit={() => setDebtEdit(d)} />
        ))}
        {closed.length > 0 && (
          <>
            <GroupHeader title="Закрытые" count={closed.length} open={closedOpen} onToggle={() => setClosedOpen(!closedOpen)} />
            {closedOpen && closed.map((d) => <DebtRow key={d.id} d={d} s={debtSummary(d, tx)} pot={all.find((e) => e.id === d.pot_id)?.name} muted onEdit={() => setDebtEdit(d)} />)}
          </>
        )}
      </Card>
      <DebtSheet open={debtEdit !== null} onClose={() => setDebtEdit(null)} debt={debtEdit === 'new' ? null : debtEdit} goals={goals} />
      <EnvelopeSheet open={editingEnv !== null} onClose={() => setEditingEnv(null)} env={editingEnv} />
      <EnvelopeSheet open={adding} onClose={() => setAdding(false)} env={null} />
      <PickSheet
        open={picking}
        onClose={() => setPicking(false)}
        label="Добавить"
        options={[
          { label: 'Конверт или цель', hint: 'отложить на трату или копить', icon: PiggyBank, sphere: 'money', onPick: () => setAdding(true) },
          { label: 'Долг', hint: 'я должна, мне должны, заём из копилки', icon: HandCoins, sphere: 'money', onPick: () => setDebtEdit('new') },
        ]}
      />
    </>
  )
}

/** The name of an envelope / goal / debt as a button that opens its sheet. */
function EditName({ name, onEdit, muted = false }: { name: string; onEdit: () => void; muted?: boolean }) {
  return (
    <button type="button" onClick={onEdit} aria-label={`${name} — изменить`} className={`-my-2 flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-base [overflow-wrap:anywhere] ${muted ? 'text-ink3' : 'font-semibold'}`}>
      {name}
      <Pencil size={14} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
    </button>
  )
}

/** The status line of an envelope: «Запланировано · Декабрь», «Отложено заранее · Декабрь», «Идёт», … */
function statusText(e: Envelope, status: EnvelopeStatus, paydays: readonly string[], today: string): string {
  const month = e.pay_month?.slice(0, 7) ?? null
  const future = month !== null && today < periodStart(month, paydays)
  const label = status === 'reserved' && future ? 'Отложено заранее' : ENVELOPE_STATUS_LABEL[status]
  return month && month !== currentPeriodMonth(today, paydays) ? `${label} · ${periodName(month, today)}` : label
}

function EnvelopeCard({
  e,
  s,
  status,
  paydays,
  onEdit,
  onReserve,
}: {
  e: Envelope
  s: ReturnType<typeof envelopeSummary>
  status: EnvelopeStatus
  paydays: readonly string[]
  onEdit: () => void
  onReserve: () => void
}) {
  const today = todayBerlin()
  return (
    <Card>
      <div className="flex items-baseline gap-2">
        <EditName name={e.name} onEdit={onEdit} />
        <span className="text-cap text-ink2 tabular-nums">
          осталось <span className="font-semibold text-ink">{eur(s.leftCents)}</span>
        </span>
      </div>
      <ProgressBar value={s.spentCents} max={s.plannedCents} fillClass="bg-money" label={e.name} />
      <div className="text-cap text-ink2 tabular-nums">{[`заложено ${eur(s.plannedCents)}`, `потрачено ${eur(s.spentCents)}`, e.when_text].filter(Boolean).join(' · ')}</div>
      {s.overCents > 0 && <div className="text-cap font-semibold text-amber-ink tabular-nums">+{eur(s.overCents)} сверх</div>}
      <div className="flex flex-wrap items-center gap-2">
        <MetaChip kind={status === 'planned' ? 'clock' : 'ok'} text={statusText(e, status, paydays, today)} />
        {status === 'planned' && (
          <Button variant="secondary" className="ml-auto h-11" onClick={onReserve} aria-label={`Отложить сейчас: ${e.name}`}>
            Отложить сейчас
          </Button>
        )}
      </div>
    </Card>
  )
}

function GoalCard({
  g,
  p: stored,
  onAccount,
  forecast,
  loans,
  onEdit,
}: {
  g: Envelope
  p: ReturnType<typeof goalProgress>
  /** the goal is the only one on its account: «сейчас» is that account's balance, nothing to enter */
  onAccount: ReturnType<typeof goalAccountNow>
  /** stage 2: a month's share to the due date and the pace — numbers and dates only */
  forecast: ReturnType<typeof goalForecast>
  loans: Debt[]
  onEdit: () => void
}) {
  const today = todayBerlin()
  const p = onAccount
    ? { ...stored, nowCents: onAccount.cents, asOf: today, share: stored.targetCents ? Math.min(1, Math.max(0, onAccount.cents) / stored.targetCents) : null }
    : stored
  const late = p.due !== null && p.due < today && (p.share ?? 0) < 1
  const save = useSaveGoalBalance()
  const toast = useToast()
  const [entering, setEntering] = useState(false)
  const [input, setInput] = useState('')
  const cents = parseEurInput(input)
  return (
    <Card>
      <div className="flex items-baseline gap-2">
        <EditName name={g.name} onEdit={onEdit} />
        {p.targetCents !== null && (
          <span className="text-cap text-ink2 tabular-nums">
            {p.nowCents !== null ? <span className="font-semibold text-ink">{eur(p.nowCents)}</span> : '—'} из {eur(p.targetCents)}
          </span>
        )}
      </div>
      {p.targetCents !== null && <ProgressBar value={p.nowCents ?? 0} max={p.targetCents} fillClass="bg-money" label={`${g.name}: накоплено`} />}
      <div className="flex flex-wrap items-center gap-2 text-cap text-ink2 tabular-nums">
        {onAccount ? <span>остаток счёта {onAccount.account.name}</span> : p.nowCents !== null ? <span>остаток на {formatDayMonth(p.asOf!)}</span> : <span>остаток пока не внесён</span>}
        {p.due && (late ? <MetaChip kind="late" text={`Срок прошёл · ${formatWeekdayDate(p.due)}`} /> : <MetaChip kind="flag" text={`до ${formatWeekdayDate(p.due)}`} />)}
      </div>
      {onAccount ? null : entering ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (cents === null) return
            save.mutate({ goal: g, date: today, amount: cents / 100 }, { onSuccess: () => toast({ text: `${g.name}: остаток ${eur(cents)} на сегодня` }) })
            setEntering(false)
            setInput('')
          }}
        >
          <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} inputMode="decimal" placeholder="Сейчас на цели, €" aria-label={`Остаток: ${g.name}`} className={`${field} min-w-0 flex-1`} />
          <Button type="submit" disabled={cents === null}>
            Сохранить
          </Button>
        </form>
      ) : (
        <Button variant="secondary" className="h-11 self-start" onClick={() => setEntering(true)}>
          {p.nowCents !== null ? 'Обновить остаток' : 'Внести остаток'}
        </Button>
      )}
      {loans.map((d) => (
        <p key={d.id} className="m-0 rounded-xl bg-sub px-3 py-2 text-cap text-ink">
          Взято в долг из этой цели: {eur(Math.round(Number(d.amount_eur) * 100))}
          {d.note ? ` · ${d.note}` : ''} — вернуть, см. «Долги»
        </p>
      ))}
      {p.borrowedCents > 0 && <div className="text-cap font-semibold text-amber-ink tabular-nums">ещё не возвращено {eur(p.borrowedCents)}</div>}
      {forecast && !late && <GoalForecastLines f={forecast} />}
    </Card>
  )
}

/** «нужно ≈ X € в месяц до 31.12 · ещё Y €» and the pace: «≈ N € в месяц — к 2.02» / «темпа пока нет» / «остаток не растёт». */
function GoalForecastLines({ f }: { f: NonNullable<ReturnType<typeof goalForecast>> }) {
  const need =
    f.due === null
      ? `ещё ${formatEstimate(f.leftCents)}`
      : f.perMonthCents !== null
        ? `нужно ≈ ${formatEstimate(f.perMonthCents)} в месяц до ${formatDayMonth(f.due)} · ещё ${formatEstimate(f.leftCents)}`
        : `до ${formatDayMonth(f.due)} — ещё ${formatEstimate(f.leftCents)}`
  const pace =
    f.pace === 'none'
      ? 'темпа пока нет'
      : f.pace === 'not_growing'
        ? 'остаток не растёт'
        : `при текущем темпе ≈ ${formatEstimate(f.pace.perMonthCents)} в месяц — к ${formatDayMonth(f.pace.closesOn)}${f.pace.closesOn.slice(0, 4) !== f.due?.slice(0, 4) ? `.${f.pace.closesOn.slice(0, 4)}` : ''}`
  return (
    <div className="flex flex-col gap-0.5 text-cap text-ink2 tabular-nums">
      <span>{need}</span>
      <span>{pace}</span>
    </div>
  )
}

function DebtRow({ d, s, pot, muted = false, onEdit }: { d: Debt; s: ReturnType<typeof debtSummary>; pot?: string; muted?: boolean; onEdit: () => void }) {
  const today = todayBerlin()
  const late = !muted && d.due_date !== null && d.due_date < today && s.leftCents > 0
  return (
    <div className="flex flex-col gap-1 border-t border-line pt-3 first-of-type:border-t-0">
      <div className="flex items-center gap-2">
        <EditName name={d.who} onEdit={onEdit} muted={muted} />
        <span className="text-base font-semibold tabular-nums">{muted ? eur(s.amountCents) : eur(s.leftCents)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-cap text-ink2 tabular-nums">
        <span>{DIRECTION[d.direction] ?? d.direction}</span>
        {pot && <span>из «{pot}»</span>}
        {!muted && <span>{`возвращено ${eur(s.repaidCents)} из ${eur(s.amountCents)}`}</span>}
        {d.due_date && !muted && (late ? <MetaChip kind="late" text={`Срок прошёл · ${formatWeekdayDate(d.due_date)}`} /> : <MetaChip kind="flag" text={`до ${formatWeekdayDate(d.due_date)}`} />)}
        {muted && <span>закрыт</span>}
      </div>
      {!muted && <ProgressBar value={s.repaidCents} max={s.amountCents} fillClass="bg-money" label={`${d.who}: возвращено`} />}
    </div>
  )
}

function EnvelopeSheet({ open, onClose, env }: { open: boolean; onClose: () => void; env: Envelope | null }) {
  return (
    <BottomSheet open={open} onClose={onClose} label={env ? env.name : 'Новый конверт или цель'}>
      {open && <EnvelopeForm key={env?.id ?? 'new'} env={env} onClose={onClose} />}
    </BottomSheet>
  )
}

const amountText = (v: number | null) => (v === null || Number(v) === 0 ? '' : String(Number(v)).replace('.', ','))

function EnvelopeForm({ env, onClose }: { env: Envelope | null; onClose: () => void }) {
  const [name, setName] = useState(env?.name ?? '')
  const [amount, setAmount] = useState(amountText(env?.planned_eur ?? null))
  const [when, setWhen] = useState(env?.when_text ?? '')
  const [goal, setGoal] = useState(amountText(env?.goal_eur ?? null))
  const [due, setDue] = useState(env?.goal_date ?? '')
  const [type, setType] = useState<'envelope' | 'goal'>(env?.type === 'goal' ? 'goal' : 'envelope')
  const [accountId, setAccountId] = useState<string | null>(env?.account_id ?? null)
  const paydays = usePaydays() ?? []
  const today = todayBerlin()
  const months = periodMonths(today, paydays)
  // a period of the past (or none, as before) shows as today's; saving writes the chosen one
  const [payMonth, setPayMonth] = useState<string>(() => {
    const m = env?.pay_month?.slice(0, 7)
    return m && m >= months[0]! ? m : months[0]!
  })
  const [early, setEarly] = useState(env?.reserved_early ?? false)
  const future = today < periodStart(payMonth, paydays)
  const accounts = useAccounts()
  const accountList = accounts.data ?? []
  // a goal lives only on «Подушка»; an envelope — on any account (decision 18.11.2026)
  const accountProblem = type === 'goal' ? goalAccountProblem(accountId, accountList) : null
  const create = useCreateEnvelope()
  const update = useUpdateEnvelope()
  const toast = useToast()
  const cents = parseEurInput(amount)
  const goalCents = parseEurInput(goal)
  const valid = name.trim() && (amount === '' || cents !== null) && (type === 'envelope' || (goalCents !== null && goalCents > 0)) && accountProblem === null
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        const values = {
          name: name.trim(),
          type,
          planned_eur: cents === null ? null : cents / 100,
          when_text: when.trim() || null,
          goal_eur: type === 'goal' && goalCents ? goalCents / 100 : null,
          goal_date: type === 'goal' && due ? due : null,
          account_id: accountId,
          // an envelope of today's period keeps what it had (null — as before); another period is written
          ...(type === 'envelope'
            ? { pay_month: payMonth === months[0] && !env?.pay_month ? null : `${payMonth}-01`, reserved_early: future && early }
            : {}),
        }
        const done = () => {
          toast({ text: env ? `«${name.trim()}» — сохранено` : type === 'goal' ? `Цель «${name.trim()}» заведена` : `Конверт «${name.trim()}» готов` })
          onClose()
        }
        if (env) update.mutate({ id: env.id, patch: values }, { onSuccess: done })
        else create.mutate(values, { onSuccess: done })
      }}
    >
      <SegmentedTabs
        label="Вид"
        segments={[
          { value: 'envelope', label: 'Конверт' },
          { value: 'goal', label: 'Цель' },
        ]}
        value={type}
        onChange={setType}
      />
      <p className="m-0 text-cap text-ink2">
        {type === 'goal' ? 'Копишь к сумме. Если цель одна на своём счёте, накоплено — остаток счёта; если на счёте несколько целей — внеси долю кнопкой «Внести остаток».' : 'Деньги отложены на трату и не входят в лимит недели.'}
      </p>
      <input autoFocus={!env} value={name} onChange={(e) => setName(e.target.value)} placeholder="На что" aria-label="Название" className={field} />
      {type === 'goal' ? (
        <>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} inputMode="decimal" placeholder="Цель, €" aria-label="Цель" className={field} />
          <label className="flex flex-col gap-2">
            <span className="text-cap text-ink2">Срок, если есть</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Срок" className={field} />
          </label>
        </>
      ) : (
        <>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Сколько заложить, €" aria-label="Сумма" className={field} />
          <input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Когда, например «до 20.12»" aria-label="Когда" className={field} />
          <Choice
            label="Из каких денег"
            options={(months.includes(payMonth) ? months : [...months, payMonth]).map((m) => ({ value: m, label: periodName(m, today) }))}
            value={payMonth}
            onChange={(v) => v && setPayMonth(v)}
          />
          {future && (
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 text-base">
                Отложить сейчас
                <span className="block text-cap text-ink2">
                  {early
                    ? 'Отложится из сегодняшних денег — «Свободно» станет меньше уже сейчас.'
                    : `До дня денег (${formatDayMonth(periodStart(payMonth, paydays))}) не трогает «Свободно».`}
                </span>
              </span>
              <Switch checked={early} onChange={setEarly} label="Отложить сейчас" />
            </div>
          )}
        </>
      )}
      <Choice
        label={type === 'goal' ? 'Где лежат деньги — счёт «Подушки»' : 'Где лежат деньги'}
        options={accountOptions(accountList, { group: type === 'goal' ? 'cushion' : undefined, keep: accountId }).map((a) => ({ value: a.id, label: a.name }))}
        value={accountId}
        onChange={setAccountId}
      />
      {accountProblem && <p className="m-0 text-cap font-semibold text-amber-ink">{accountProblem}</p>}
      <Button type="submit" disabled={!valid || create.isPending || update.isPending}>
        Сохранить
      </Button>
      {env && (
        <Button
          variant="quiet"
          onClick={() => {
            update.mutate({ id: env.id, patch: { archived: true } })
            toast({ text: `«${env.name}» — в архиве`, actionLabel: 'Вернуть', onAction: () => update.mutate({ id: env.id, patch: { archived: false } }) })
            onClose()
          }}
        >
          Убрать в архив
        </Button>
      )}
    </form>
  )
}
