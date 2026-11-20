import { useState, type ReactNode } from 'react'
import { ChevronRight, HandCoins, Landmark, PiggyBank } from 'lucide-react'
import { Link } from 'react-router'
import { useAddAction } from '@/app/addSheetContext'
import { useToast } from '@/app/toastContext'
import { XYChart } from '@/components/charts/Chart'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, SkeletonCard } from '@/components/ui/Feedback'
import { PickSheet } from '@/components/ui/PickSheet'
import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { cn } from '@/components/ui/cn'
import { ACCOUNT_GROUPS, type AccountGroup } from '@/lib/constants'
import { formatDayMonth, todayBerlin } from '@/lib/dates'
import { formatEur } from '@/lib/format'
import { GROUP_LABEL, accountsOverview, groupForecast, reconcileAccounts, reservesByAccount, type AccountLine, type GroupLine } from '@/lib/rules/accounts'
import { BALANCE_LINE_POINTS, balanceLine, niceTicks } from '@/lib/rules/charts'
import { forecastEnd } from '@/lib/rules/money'
import { ruleState } from '@/lib/rules/recurringEdit'
import { DebtSheet } from './DebtSheet'
import { DebtsCard, GoalSheet, GoalsCard } from './SavingsDebts'
import { accountsCheckText } from './checkText'
import { useAccounts, useActualBalances, useDebts, useEnvelopes, usePaydays, usePlanTransactions, useRecurring, useSaveAccount, type Account, type Debt, type Envelope } from './api'

const eur = (c: number) => formatEur(c, { whole: true })
const field = 'h-12 w-full rounded-xl border border-line2 bg-card px-4 text-base text-ink outline-none placeholder:text-ink3 focus:border-ink2'

/**
 * Счета (decision 18.11.2026; docs/money-redesign.md, phase 5 — a tab of «Деньги»): every account — all and free (all
 * minus what is set aside on it), by group with totals; «Подушка» with its own forecast; the reconciliation with
 * «Остатки»; then Копилки (goals) and Долги, a row each, and the recurring rules one tap deeper. «+» — a new account,
 * копилка or debt; a tap — its sheet.
 */
export function AccountsTab() {
  const today = todayBerlin()
  const accounts = useAccounts()
  const txs = usePlanTransactions()
  const envelopes = useEnvelopes()
  const debts = useDebts()
  const balances = useActualBalances()
  const paydays = usePaydays()
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [goalEdit, setGoalEdit] = useState<Envelope | 'new' | null>(null)
  const [debtEdit, setDebtEdit] = useState<Debt | 'new' | null>(null)
  const [picking, setPicking] = useState(false)
  const rules = useRecurring()
  useAddAction(() => setPicking(true))
  if (accounts.isPending || txs.isPending || envelopes.isPending || debts.isPending || balances.isPending || paydays === null) return <SkeletonCard />

  const list = accounts.data ?? []
  const all = txs.data ?? []
  const reserves = reservesByAccount({ envelopes: envelopes.data ?? [], debts: debts.data ?? [], txs: all, balances: balances.data ?? [], accounts: list, today, paydays })
  const groups = accountsOverview(all, list, reserves, today)
  const goals = (envelopes.data ?? []).filter((e) => e.type === 'goal')
  const ruleCount = (rules.data ?? []).filter((r) => ruleState(r, today) !== 'ended').length
  // goals and debts (phase 5: from the old «Конверты и долги»), the recurring rules one tap deeper, and the sheets
  const sheet = (
    <>
      <GoalsCard goals={goals} debts={debts.data ?? []} txs={all} balances={balances.data ?? []} accounts={list} onEdit={setGoalEdit} />
      <DebtsCard debts={debts.data ?? []} goals={goals} txs={all} onEdit={setDebtEdit} />
      <Link to="/money/recurring" className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-card px-4 text-base text-ink no-underline active:bg-sub">
        <span className="min-w-0 flex-1">
          Регулярные платежи {ruleCount > 0 && <span className="text-ink2 tabular-nums">· {ruleCount}</span>}
        </span>
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
      </Link>
      <AccountSheet open={editing !== null} onClose={() => setEditing(null)} account={editing === 'new' ? null : editing} count={list.length} />
      <GoalSheet open={goalEdit !== null} onClose={() => setGoalEdit(null)} goal={goalEdit === 'new' ? null : goalEdit} />
      <DebtSheet open={debtEdit !== null} onClose={() => setDebtEdit(null)} debt={debtEdit === 'new' ? null : debtEdit} goals={goals} />
      <PickSheet
        open={picking}
        onClose={() => setPicking(false)}
        label="Добавить"
        options={[
          { label: 'Счёт', hint: 'новый счёт или кармашек', icon: Landmark, sphere: 'money', onPick: () => setEditing('new') },
          { label: 'Копилка', hint: 'копить к сумме', icon: PiggyBank, sphere: 'money', onPick: () => setGoalEdit('new') },
          { label: 'Долг', hint: 'я должна, мне должны, заём из копилки', icon: HandCoins, sphere: 'money', onPick: () => setDebtEdit('new') },
        ]}
      />
    </>
  )

  if (groups === null) {
    return (
      <>
        <EmptyState title="Старт по счетам ещё не внесён">
          Остатки счетов появятся, когда будут записаны стартовые остатки: {list.filter((a) => !a.archived).map((a) => a.name).join(', ')}.
        </EmptyState>
        {sheet}
      </>
    )
  }
  return (
    <>
      {groups.map((g) => (
        <GroupCard key={g.grp} group={g} onOpen={setEditing} forecast={g.grp === 'cushion' ? <CushionForecast txs={all} accounts={list} today={today} /> : null} />
      ))}
      <p className="m-0 text-cap text-ink2 tabular-nums">{accountsCheckText(reconcileAccounts(balances.data ?? [], all, list))}</p>
      {sheet}
    </>
  )
}

function GroupCard({ group, onOpen, forecast }: { group: GroupLine<Account>; onOpen: (a: Account) => void; forecast: ReactNode }) {
  const reserved = group.accounts.some((l) => l.reserves.length > 0)
  return (
    <Card>
      <CardHeader title={GROUP_LABEL[group.grp]} dotClass="bg-money" context={reserved ? `свободно ${eur(group.freeCents)}` : undefined} />
      <div className="text-title font-semibold tabular-nums">{eur(group.totalCents)}</div>
      {group.accounts.length === 0 ? (
        <p className="m-0 text-cap text-ink2">Счетов в этой группе нет.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {group.accounts.map((l) => (
            <li key={l.account.id} className="border-t border-line first:border-t-0">
              <AccountRow line={l} onOpen={() => onOpen(l.account)} />
            </li>
          ))}
        </ul>
      )}
      {forecast}
    </Card>
  )
}

/** An account: name and what is set aside on it; all, and free when something is set aside. */
function AccountRow({ line, onOpen }: { line: AccountLine<Account>; onOpen: () => void }) {
  const { account, totalCents, reservedCents, freeCents, reserves } = line
  return (
    <button type="button" onClick={onOpen} className="flex min-h-12 w-full items-center gap-3 py-2 text-left active:bg-sub">
      <span className="min-w-0 flex-1">
        <span className={cn('block text-base [overflow-wrap:anywhere]', account.archived && 'text-ink3')}>{account.name}</span>
        {reserves.length > 0 && (
          <span className="block text-cap text-ink2 [overflow-wrap:anywhere]">
            отложено {eur(reservedCents)} · {reserves.map((r) => r.name).join(', ')}
          </span>
        )}
        {account.archived && <span className="block text-cap text-ink2">в архиве</span>}
      </span>
      <span className="flex flex-none flex-col items-end tabular-nums">
        <span className="text-base">{eur(totalCents)}</span>
        {reserves.length > 0 && (
          <span className={cn('text-cap', freeCents < 0 ? 'font-semibold text-amber-ink' : 'text-ink2')}>свободно {eur(freeCents)}</span>
        )}
      </span>
      <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
    </button>
  )
}

/** «Подушка» to the horizon: its plan only (income to it, transfers across its border), no week budgets. */
function CushionForecast({ txs, accounts, today }: { txs: Parameters<typeof groupForecast>[0]; accounts: Account[]; today: string }) {
  const end = forecastEnd(today)
  const f = groupForecast(txs, accounts, 'cushion', today, end)
  if (!f) return null
  if (!f.moves) return <p className="m-0 border-t border-line pt-3 text-cap text-ink2">В плане движений по «Подушке» нет — к {formatDayMonth(end)} столько же.</p>
  const line = balanceLine(txs, today, end, today, BALANCE_LINE_POINTS, f.at)
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <div className="text-base tabular-nums">
        к {formatDayMonth(end)} — <span className="font-semibold">{eur(f.endCents)}</span>
      </div>
      {f.pit.cents < f.nowCents && (
        <div className="text-cap text-ink2 tabular-nums">
          ниже всего {eur(f.pit.cents)} · {formatDayMonth(f.pit.date)}
        </div>
      )}
      <XYChart
        label={`«Подушка» до ${formatDayMonth(end)}: по плану`}
        data={line}
        height={120}
        lines={[{ key: 'plan', name: 'План', color: 'money', dash: true, unit: ' €' }]}
        yLeft={{ domain: ['auto', 'auto'], ticks: niceTicks(line.map((p) => p.plan)) }}
        todayKey={today}
      />
    </div>
  )
}

/** A new account (after the others) or a change: name, group, archive. */
function AccountSheet({ open, onClose, account, count }: { open: boolean; onClose: () => void; account: Account | null; count: number }) {
  return (
    <BottomSheet open={open} onClose={onClose} label={account ? account.name : 'Новый счёт'}>
      {open && <AccountForm key={account?.id ?? 'new'} account={account} count={count} onClose={onClose} />}
    </BottomSheet>
  )
}

function AccountForm({ account, count, onClose }: { account: Account | null; count: number; onClose: () => void }) {
  const [name, setName] = useState(account?.name ?? '')
  const [grp, setGrp] = useState<AccountGroup>((account?.grp as AccountGroup) ?? 'balance')
  const save = useSaveAccount()
  const toast = useToast()
  const valid = name.trim().length > 0
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        const values = account ? { name: name.trim(), grp } : { name: name.trim(), grp, sort_order: (count + 1) * 10 }
        save.mutate(
          { id: account?.id ?? null, values },
          {
            onSuccess: () => {
              toast({ text: account ? `«${name.trim()}» — сохранено` : `Счёт «${name.trim()}» заведён` })
              onClose()
            },
          },
        )
      }}
    >
      <input autoFocus={!account} value={name} onChange={(e) => setName(e.target.value)} placeholder="Название, например Revolut · Отпуск" aria-label="Название" className={field} />
      <SegmentedTabs label="Группа" segments={ACCOUNT_GROUPS.map((g) => ({ value: g, label: GROUP_LABEL[g] }))} value={grp} onChange={setGrp} />
      <p className="m-0 text-cap text-ink2">
        {grp === 'balance' ? 'План и прогноз считаются по «Балансу»; траты — только с этих счетов.' : grp === 'cushion' ? 'Свой прогноз; цели живут здесь.' : 'Только в обзоре, без прогноза.'}
      </p>
      {save.isError && <p className="m-0 text-cap font-semibold text-amber-ink">Не сохранилось: такое название уже есть или нет сети.</p>}
      <Button type="submit" disabled={!valid || save.isPending}>
        Сохранить
      </Button>
      {account && (
        <Button
          variant="quiet"
          onClick={() =>
            save.mutate(
              { id: account.id, values: { archived: !account.archived } },
              {
                onSuccess: () => {
                  toast({ text: account.archived ? `«${account.name}» — снова в списке` : `«${account.name}» — в архиве` })
                  onClose()
                },
              },
            )
          }
        >
          {account.archived ? 'Вернуть из архива' : 'Убрать в архив'}
        </Button>
      )}
    </form>
  )
}
