import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { useToast } from '@/app/toastContext'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Feedback'
import { GroupHeader } from '@/components/ui/GroupHeader'
import { MetaChip } from '@/components/ui/MetaChip'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { formatDayMonth, formatWeekdayDate, todayBerlin } from '@/lib/dates'
import { formatEur, parseEurInput, plural } from '@/lib/format'
import { debtSummary, envelopeSummary, envelopesLeft, goalProgress } from '@/lib/rules/money'
import { DebtSheet } from './DebtSheet'
import { useActualBalances, useAllTransactions, useCreateEnvelope, useDebts, useEnvelopes, useSaveGoalBalance, useUpdateEnvelope, type Debt, type Envelope } from './api'

const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none focus:border-ink2'
const DIRECTION: Record<string, string> = { i_owe: 'я должна', owed_to_me: 'мне должны', from_pot: 'заём из копилки' }
const eur = (c: number) => formatEur(c, { whole: true })

/**
 * Конверты (design 3l, rule 4, docs/EXCEL_FORMAT.md): «Отложено» — what is left in envelopes of type «конверт»;
 * goals — now (the latest «Остатки» row of the pocket) against the target, with the due date and what is
 * borrowed from them; debts — open first, closed folded.
 */
export function EnvelopesTab() {
  const envelopes = useEnvelopes()
  const txs = useAllTransactions()
  const debts = useDebts()
  const balances = useActualBalances()
  const [adding, setAdding] = useState(false)
  const [editingEnv, setEditingEnv] = useState<Envelope | null>(null)
  // the debt sheet: null — closed, 'new' — a new debt, else the one being edited
  const [debtEdit, setDebtEdit] = useState<Debt | 'new' | null>(null)
  const [closedOpen, setClosedOpen] = useState(false)
  if (envelopes.isPending || txs.isPending || debts.isPending || balances.isPending) return <SkeletonCard />
  const all = envelopes.data ?? []
  const tx = txs.data ?? []
  const envs = all.filter((e) => e.type === 'envelope')
  const goals = all.filter((e) => e.type === 'goal')
  const debtList = debts.data ?? []
  const open = debtList.filter((d) => d.status === 'open')
  const closed = debtList.filter((d) => d.status !== 'open')
  const left = envelopesLeft(envs, tx)
  const spent = envs.reduce((s, e) => s + envelopeSummary(e, tx).spentCents, 0)

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
              <span className="text-cap text-ink2 tabular-nums">осталось в {envs.length} {plural(envs.length, ['конверте', 'конвертах', 'конвертах'])} · потрачено {eur(spent)}</span>
            </div>
          )}
          {envs.map((e) => (
            <EnvelopeCard key={e.id} e={e} s={envelopeSummary(e, tx)} onEdit={() => setEditingEnv(e)} />
          ))}
          {goals.length > 0 && <h2 className="m-0 pt-2 text-title font-semibold">Цели</h2>}
          {goals.map((g) => (
            <GoalCard key={g.id} g={g} p={goalProgress(g, balances.data ?? [], debtList, tx)} loans={open.filter((d) => d.direction === 'from_pot' && d.pot_id === g.id)} onEdit={() => setEditingEnv(g)} />
          ))}
          <Button variant="secondary" onClick={() => setAdding(true)} icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}>
            Новый конверт или цель
          </Button>
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
        <Button variant="secondary" className="h-11 self-start" onClick={() => setDebtEdit('new')} icon={<Plus size={16} strokeWidth={1.75} aria-hidden="true" />}>
          Долг
        </Button>
      </Card>
      <DebtSheet open={debtEdit !== null} onClose={() => setDebtEdit(null)} debt={debtEdit === 'new' ? null : debtEdit} goals={goals} />
      <EnvelopeSheet open={editingEnv !== null} onClose={() => setEditingEnv(null)} env={editingEnv} />
      <EnvelopeSheet open={adding} onClose={() => setAdding(false)} env={null} />
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

function EnvelopeCard({ e, s, onEdit }: { e: Envelope; s: ReturnType<typeof envelopeSummary>; onEdit: () => void }) {
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
    </Card>
  )
}

function GoalCard({ g, p, loans, onEdit }: { g: Envelope; p: ReturnType<typeof goalProgress>; loans: Debt[]; onEdit: () => void }) {
  const today = todayBerlin()
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
        {p.nowCents !== null ? <span>остаток на {formatDayMonth(p.asOf!)}</span> : <span>остаток пока не внесён</span>}
        {p.due && (late ? <MetaChip kind="late" text={`Срок прошёл · ${formatWeekdayDate(p.due)}`} /> : <MetaChip kind="flag" text={`до ${formatWeekdayDate(p.due)}`} />)}
      </div>
      {entering ? (
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
          <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} inputMode="decimal" placeholder="Сейчас в кармашке, €" aria-label={`Остаток: ${g.name}`} className={`${field} min-w-0 flex-1`} />
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
    </Card>
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
  const create = useCreateEnvelope()
  const update = useUpdateEnvelope()
  const toast = useToast()
  const cents = parseEurInput(amount)
  const goalCents = parseEurInput(goal)
  const valid = name.trim() && (amount === '' || cents !== null) && (type === 'envelope' || (goalCents !== null && goalCents > 0))
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
        {type === 'goal' ? 'Копишь к сумме. Сколько уже накоплено, считается по остатку кармашка — внеси его кнопкой «Внести остаток».' : 'Деньги отложены на трату и не входят в лимит недели.'}
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
        </>
      )}
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
