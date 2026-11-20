import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { MetaChip } from '@/components/ui/MetaChip'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatDayMonth, formatWeekdayDate, todayBerlin } from '@/lib/dates'
import { formatEstimate, formatEur, parseEurInput } from '@/lib/format'
import { accountOptions, goalAccountNow, goalAccountProblem, type AccTx, type AccountLike } from '@/lib/rules/accounts'
import { goalForecast } from '@/lib/rules/forecast'
import { debtSummary, goalProgress } from '@/lib/rules/money'
import { Choice } from './Choice'
import { useAccounts, useCreateEnvelope, useSaveGoalBalance, useUpdateEnvelope, type ActualBalance, type Debt, type Envelope } from './api'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'
const DIRECTION: Record<string, string> = { i_owe: 'я должна', owed_to_me: 'мне должны', from_pot: 'заём из копилки' }
const eur = (c: number) => formatEur(c, { whole: true })
const row = 'flex w-full flex-col gap-2 border-t border-line py-3 text-left first:border-t-0'

/**
 * «Счета» → Копилки (docs/money-redesign.md, phase 5; goals of `envelopes`): one card, a row per goal — now against the
 * target, the bar, the due date, what a month needs and the pace; «Внести остаток» when the goal shares its account.
 * A loan from a goal is a debt (below) and a return in «План»; here only how much is still not back.
 */
export function GoalsCard({
  goals,
  debts,
  txs,
  balances,
  accounts,
  onEdit,
}: {
  goals: Envelope[]
  debts: Debt[]
  txs: readonly AccTx[]
  balances: readonly ActualBalance[]
  accounts: readonly AccountLike[]
  onEdit: (g: Envelope) => void
}) {
  const today = todayBerlin()
  return (
    <Card>
      <CardHeader title="Копилки" dotClass="bg-money" />
      {goals.length === 0 ? (
        <p className="m-0 text-cap text-ink2">Копилок пока нет. «+» → «Копилка»: сумма, к которой копишь, и срок, если есть.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {goals.map((g) => (
            <li key={g.id} className={row}>
              <GoalRow
                g={g}
                p={goalProgress(g, balances, debts, txs as never)}
                onAccount={goalAccountNow(g, goals, accounts, txs, today)}
                forecast={goalForecast(g, { goals, accounts, txs, balances, today })}
                onEdit={() => onEdit(g)}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function GoalRow({
  g,
  p: stored,
  onAccount,
  forecast,
  onEdit,
}: {
  g: Envelope
  p: ReturnType<typeof goalProgress>
  /** the goal is the only one on its account: «сейчас» is that account's balance, nothing to enter */
  onAccount: ReturnType<typeof goalAccountNow>
  forecast: ReturnType<typeof goalForecast>
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
    <>
      <button type="button" onClick={onEdit} aria-label={`${g.name} — изменить`} className="-my-1 flex min-h-11 w-full items-center gap-3 text-left">
        <span className="min-w-0 flex-1 text-base font-semibold [overflow-wrap:anywhere]">{g.name}</span>
        {p.targetCents !== null && (
          <span className="text-base tabular-nums">
            {p.nowCents !== null ? eur(p.nowCents) : '—'} <span className="text-ink2">из {eur(p.targetCents)}</span>
          </span>
        )}
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
      </button>
      {p.targetCents !== null && <ProgressBar value={p.nowCents ?? 0} max={p.targetCents} fillClass="bg-money" label={`${g.name}: накоплено`} />}
      <div className="flex flex-wrap items-center gap-2 text-cap text-ink2 tabular-nums">
        {onAccount ? <span>остаток счёта {onAccount.account.name}</span> : p.nowCents !== null ? <span>остаток на {formatDayMonth(p.asOf!)}</span> : <span>остаток пока не внесён</span>}
        {p.due && (late ? <MetaChip kind="late" text={`Срок прошёл · ${formatWeekdayDate(p.due)}`} /> : <MetaChip kind="flag" text={`до ${formatWeekdayDate(p.due)}`} />)}
      </div>
      {p.borrowedCents > 0 && <div className="text-cap font-semibold text-amber-ink tabular-nums">взято в долг, не возвращено {eur(p.borrowedCents)}</div>}
      {forecast && !late && <GoalForecastLines f={forecast} />}
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
          <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} inputMode="decimal" placeholder="Сейчас в копилке, €" aria-label={`Остаток: ${g.name}`} className={`${field} min-w-0 flex-1`} />
          <Button type="submit" disabled={cents === null}>
            Сохранить
          </Button>
        </form>
      ) : (
        <Button variant="secondary" className="h-11 self-start" onClick={() => setEntering(true)}>
          {p.nowCents !== null ? 'Обновить остаток' : 'Внести остаток'}
        </Button>
      )}
    </>
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

/**
 * «Счета» → Долги (phase 5): one row per debt — who, what is left, direction and due date; details and changes in its
 * sheet by a tap. Closed ones folded.
 */
export function DebtsCard({ debts, goals, txs, onEdit }: { debts: Debt[]; goals: Envelope[]; txs: readonly AccTx[]; onEdit: (d: Debt) => void }) {
  const [closedOpen, setClosedOpen] = useState(false)
  const open = debts.filter((d) => d.status === 'open')
  const closed = debts.filter((d) => d.status !== 'open')
  const pot = (d: Debt) => goals.find((g) => g.id === d.pot_id)?.name
  return (
    <Card>
      <CardHeader title="Долги" dotClass="bg-money" context={debts.length === 0 ? undefined : open.length ? `открыто ${open.length}` : 'всё закрыто'} />
      {debts.length === 0 && <p className="m-0 text-cap text-ink2">Долгов нет. Сюда — депозит, который вернёшь, деньги, которые ждёшь, и заём из своей копилки.</p>}
      {open.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {open.map((d) => (
            <li key={d.id}>
              <DebtRow d={d} s={debtSummary(d, txs as never)} pot={pot(d)} onEdit={() => onEdit(d)} />
            </li>
          ))}
        </ul>
      )}
      {closed.length > 0 && (
        <>
          <GroupHeader title="Закрытые" count={closed.length} open={closedOpen} onToggle={() => setClosedOpen(!closedOpen)} />
          {closedOpen && (
            <ul className="m-0 flex list-none flex-col p-0">
              {closed.map((d) => (
                <li key={d.id}>
                  <DebtRow d={d} s={debtSummary(d, txs as never)} pot={pot(d)} muted onEdit={() => onEdit(d)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}

function DebtRow({ d, s, pot, muted = false, onEdit }: { d: Debt; s: ReturnType<typeof debtSummary>; pot?: string; muted?: boolean; onEdit: () => void }) {
  const today = todayBerlin()
  const late = !muted && d.due_date !== null && d.due_date < today && s.leftCents > 0
  const meta = [DIRECTION[d.direction] ?? d.direction, pot && pot !== d.who ? `из «${pot}»` : null, !muted && s.repaidCents > 0 ? `возвращено ${eur(s.repaidCents)} из ${eur(s.amountCents)}` : null, muted ? 'закрыт' : null].filter(Boolean)
  return (
    <button type="button" onClick={onEdit} aria-label={`${d.who} — изменить`} className="flex min-h-12 w-full items-center gap-3 border-t border-line py-2 text-left">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={muted ? 'text-base text-ink3' : 'text-base'}>{d.who}</span>
        <span className="flex flex-wrap items-center gap-2 text-cap text-ink2 tabular-nums">
          <span>{meta.join(' · ')}</span>
          {d.due_date && !muted && (late ? <MetaChip kind="late" text={`Срок прошёл · ${formatWeekdayDate(d.due_date)}`} /> : <MetaChip kind="flag" text={`до ${formatWeekdayDate(d.due_date)}`} />)}
        </span>
      </span>
      <span className={muted ? 'text-base text-ink3 tabular-nums' : 'text-base tabular-nums'}>{muted ? eur(s.amountCents) : eur(s.leftCents)}</span>
      <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
    </button>
  )
}

/** A goal (копилка): new or a change — name, target, due date, the account of «Подушка»; «Убрать в архив». */
export function GoalSheet({ open, onClose, goal }: { open: boolean; onClose: () => void; goal: Envelope | null }) {
  return (
    <BottomSheet open={open} onClose={onClose} label={goal ? goal.name : 'Новая копилка'}>
      {open && <GoalForm key={goal?.id ?? 'new'} goal={goal} onClose={onClose} />}
    </BottomSheet>
  )
}

const amountText = (v: number | null) => (v === null || Number(v) === 0 ? '' : String(Number(v)).replace('.', ','))

function GoalForm({ goal, onClose }: { goal: Envelope | null; onClose: () => void }) {
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(amountText(goal?.goal_eur ?? null))
  const [due, setDue] = useState(goal?.goal_date ?? '')
  const [accountId, setAccountId] = useState<string | null>(goal?.account_id ?? null)
  const accounts = useAccounts()
  const accountList = accounts.data ?? []
  const accountProblem = goalAccountProblem(accountId, accountList)
  const create = useCreateEnvelope()
  const update = useUpdateEnvelope()
  const toast = useToast()
  const cents = parseEurInput(target)
  const valid = name.trim() !== '' && cents !== null && cents > 0 && accountProblem === null
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        const values = { name: name.trim(), type: 'goal', goal_eur: cents! / 100, goal_date: due || null, account_id: accountId }
        const done = () => {
          toast({ text: goal ? `«${name.trim()}» — сохранено` : `Копилка «${name.trim()}» заведена` })
          onClose()
        }
        if (goal) update.mutate({ id: goal.id, patch: values }, { onSuccess: done })
        else create.mutate(values, { onSuccess: done })
      }}
    >
      <p className="m-0 text-cap text-ink2">Копишь к сумме. Если копилка одна на своём счёте, накоплено — остаток счёта; если на счёте несколько — внеси долю кнопкой «Внести остаток».</p>
      <input autoFocus={!goal} value={name} onChange={(e) => setName(e.target.value)} placeholder="На что копишь" aria-label="Название" className={field} />
      <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="Цель, €" aria-label="Цель" className={field} />
      <label className="flex flex-col gap-2">
        <span className="text-cap text-ink2">Срок, если есть</span>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Срок" className={field} />
      </label>
      <Choice
        label="Где лежат деньги — счёт «Подушки»"
        options={accountOptions(accountList, { group: 'cushion', keep: accountId }).map((a) => ({ value: a.id, label: a.name }))}
        value={accountId}
        onChange={setAccountId}
      />
      {accountProblem && <p className="m-0 text-cap font-semibold text-amber-ink">{accountProblem}</p>}
      <Button type="submit" disabled={!valid || create.isPending || update.isPending}>
        Сохранить
      </Button>
      {goal && (
        <Button
          variant="quiet"
          onClick={() => {
            update.mutate({ id: goal.id, patch: { archived: true } })
            toast({ text: `«${goal.name}» — в архиве`, actionLabel: 'Вернуть', onAction: () => update.mutate({ id: goal.id, patch: { archived: false } }) })
            onClose()
          }}
        >
          Убрать в архив
        </Button>
      )}
    </form>
  )
}
