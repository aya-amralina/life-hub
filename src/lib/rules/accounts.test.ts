import { describe, expect, it } from 'vitest'
import {
  accountBalanceAt,
  accountDelta,
  accountOptions,
  accountsProblem,
  accountsStart,
  balanceView,
  goalAccountNow,
  goalAccountProblem,
  groupBalanceAt,
  groupDelta,
  groupOfAccount,
  legacyAccountName,
  parseBalanceInput,
  reviewBalances,
  reconcileAccounts,
  type AccTx,
  type AccountLike,
} from './accounts'
import { balanceLine } from './charts'
import { balanceAt, monthsTable } from './money'

const acc = (id: string, grp: string, sort_order = 0, archived = false): AccountLike => ({ id, name: id, grp, sort_order, archived })
const accounts = [acc('main', 'balance', 10), acc('month', 'balance', 20), acc('spark', 'balance', 30), acc('cushion', 'cushion', 50), acc('dep', 'separate', 70)]
const groupOf = groupOfAccount(accounts)
const START = '2026-11-18'

const tx = (p: Partial<AccTx>): AccTx => ({
  date: '2026-11-19',
  amount_eur: 1,
  kind: 'expense',
  category: null,
  envelope_id: null,
  is_planned: false,
  confirmed_at: null,
  account_id: null,
  to_account_id: null,
  ...p,
})
const opening = (account_id: string, amount_eur: number) => tx({ date: START, kind: 'opening', account_id, amount_eur })
const plan = (p: Partial<AccTx>) => tx({ is_planned: true, ...p })

// the common pot before the start, then the start by accounts and what happens after it
const txs: AccTx[] = [
  tx({ date: '2026-10-13', kind: 'opening', amount_eur: 1000 }),
  tx({ date: '2026-11-17', amount_eur: 5, category: 'Продукты', account_id: 'main' }), // inside the start balances
  plan({ date: '2026-11-15', amount_eur: 40, account_id: 'spark' }), // a planned row up to the start: inside the start too
  opening('main', 300),
  opening('month', 100),
  opening('spark', -50), // Dispo
  opening('cushion', 500),
  opening('dep', 100),
  plan({ date: '2026-11-16', amount_eur: 25, entry_kind: 'week_budget', grp: 'Жизнь' }), // week 16–22.11, goes on past the start
  plan({ date: '2026-11-23', amount_eur: 25, entry_kind: 'week_budget', grp: 'Жизнь' }),
  tx({ date: '2026-11-19', amount_eur: 10, category: 'Продукты', account_id: 'main' }),
  tx({ date: '2026-11-20', amount_eur: 50, kind: 'transfer', account_id: 'main', to_account_id: 'month' }), // inside «Баланс»
  tx({ date: '2026-11-21', amount_eur: 55, kind: 'transfer', account_id: 'main', to_account_id: 'cushion' }), // «Баланс» → «Подушка»
  tx({ date: '2026-11-22', amount_eur: 2, kind: 'income', account_id: 'cushion' }), // interest
  plan({ date: '2026-11-30', amount_eur: 100, kind: 'transfer', account_id: 'dep', to_account_id: 'main' }), // the deposit back to «Баланс»…
  plan({ date: '2026-11-30', amount_eur: 100, account_id: 'main', grp: 'Долги' }), // …and returned to the tenant
]

describe('accounts: what a row does', () => {
  it('to one account: expense −, income and start +, transfer − from / + to', () => {
    expect(accountDelta(tx({ amount_eur: 10, account_id: 'main' }), 'main')).toBe(-1000)
    expect(accountDelta(tx({ kind: 'income', amount_eur: 2, account_id: 'cushion' }), 'cushion')).toBe(200)
    expect(accountDelta(opening('spark', -50), 'spark')).toBe(-5000)
    const t = tx({ kind: 'transfer', amount_eur: 55, account_id: 'main', to_account_id: 'cushion' })
    expect([accountDelta(t, 'main'), accountDelta(t, 'cushion'), accountDelta(t, 'month')]).toEqual([-5500, 5500, 0])
  })
  it('to a group: a transfer inside it is nothing, between groups it moves the sum', () => {
    const inside = tx({ kind: 'transfer', amount_eur: 50, account_id: 'main', to_account_id: 'month' })
    const across = tx({ kind: 'transfer', amount_eur: 55, account_id: 'main', to_account_id: 'cushion' })
    expect(groupDelta(inside, groupOf, 'balance')).toBe(0)
    expect([groupDelta(across, groupOf, 'balance'), groupDelta(across, groupOf, 'cushion'), groupDelta(across, groupOf, 'separate')]).toEqual([-5500, 5500, 0])
  })
  it('a row without an account counts as «Баланс»; a transfer without «куда» (history) as nothing', () => {
    expect(groupDelta(tx({ amount_eur: 3 }), groupOf, 'balance')).toBe(-300)
    expect(groupDelta(tx({ amount_eur: 3 }), groupOf, 'cushion')).toBe(0)
    expect(groupDelta(tx({ kind: 'transfer', amount_eur: 100, account_id: 'main' }), groupOf, 'balance')).toBe(0)
  })
  it('an unknown account id counts as «Баланс» too', () => expect(groupOf('gone')).toBe('balance'))
  it('the old text «Счёт»: Revolut is the main account, the rest keep their names', () => {
    expect(legacyAccountName('Revolut')).toBe('Revolut · Основной')
    expect(legacyAccountName('Sparkasse')).toBe('Sparkasse')
  })
})

describe('accounts: start and balances', () => {
  it('the start is the date of the start balances; none — null', () => {
    expect(accountsStart(txs)).toBe(START)
    expect(accountsStart(txs.filter((t) => !(t.kind === 'opening' && t.account_id)))).toBeNull()
    expect(accountsStart([{ ...opening('main', 1), cancelled_at: 'x' }])).toBeNull()
  })
  it('«Баланс» fact: its start balances (Dispo included) and what happened after; history and plans up to the start stay out', () => {
    // 300 + 100 − 50 − 10 (19.11); the transfer main → month is inside the group
    expect(groupBalanceAt(txs, accounts, 'balance', '2026-11-20', 'fact')).toBe(34000)
    expect(groupBalanceAt(txs, accounts, 'balance', '2026-11-22', 'fact')).toBe(28500) // − 55 to «Подушка»
  })
  it('«Баланс» plan, rule 26: what is left of the start week budget counts the expenses before the start too', () => {
    // today 19.11: spent 5 (17.11, inside the start) + 10 → 10 of 25 left; 350 − 10 − 10
    expect(groupBalanceAt(txs, accounts, 'balance', '2026-11-19', 'plan', '2026-11-19')).toBe(33000)
    // to 30.11: − 55 to «Подушка», − 25 next week, deposit in and out = 0
    expect(groupBalanceAt(txs, accounts, 'balance', '2026-11-30', 'plan', '2026-11-19')).toBe(25000)
  })
  it('«Подушка» and «Отдельно» have no week budgets; transfers move money between them', () => {
    expect(groupBalanceAt(txs, accounts, 'cushion', '2026-11-30', 'plan', '2026-11-19')).toBe(55700)
    expect(groupBalanceAt(txs, accounts, 'separate', '2026-11-30', 'plan', '2026-11-19')).toBe(0)
    expect(groupBalanceAt(txs, accounts, 'separate', '2026-11-30', 'fact', '2026-11-19')).toBe(10000)
  })
  it('before the start, or with no start yet — null: the common pot counts', () => {
    expect(groupBalanceAt(txs, accounts, 'balance', '2026-11-17', 'fact')).toBeNull()
    const pot = txs.filter((t) => !(t.kind === 'opening' && t.account_id))
    expect(groupBalanceAt(pot, accounts, 'balance', '2026-11-20', 'fact')).toBeNull()
    expect(balanceAt(pot, '2026-11-17', 'fact')).toBe(99500) // the pot is untouched by the accounts
  })
  it('one account from the start: transfers on both sides, Dispo below zero', () => {
    expect(accountBalanceAt(txs, 'main', '2026-11-22')).toBe(18500) // 300 − 10 − 50 − 55
    expect(accountBalanceAt(txs, 'month', '2026-11-22')).toBe(15000)
    expect(accountBalanceAt(txs, 'spark', '2026-11-22')).toBe(-5000)
    expect(accountBalanceAt(txs, 'dep', '2026-11-30', 'plan')).toBe(0)
    expect(accountBalanceAt(txs, 'main', '2026-11-17')).toBeNull()
  })
})

describe('accounts: what the forms allow', () => {
  const f = (p: Partial<Parameters<typeof accountsProblem>[0]>) => ({ kind: 'expense', date: '2026-11-20', account_id: 'main', to_account_id: null, ...p })
  it('after the start an expense only from «Баланс»', () => {
    expect(accountsProblem(f({}), accounts, START)).toBeNull()
    expect(accountsProblem(f({ account_id: 'cushion' }), accounts, START)).toBe('Трата — только со счетов «Баланса». Сначала перевод на основной.')
    expect(accountsProblem(f({ account_id: null }), accounts, START)).toBeNull()
  })
  it('income to any account', () => expect(accountsProblem(f({ kind: 'income', account_id: 'cushion' }), accounts, START)).toBeNull())
  it('a transfer: «откуда» and «куда», two different accounts', () => {
    expect(accountsProblem(f({ kind: 'transfer', to_account_id: null }), accounts, START)).toBe('Выбери, откуда и куда.')
    expect(accountsProblem(f({ kind: 'transfer', to_account_id: 'main' }), accounts, START)).toBe('Откуда и куда — разные счета.')
    expect(accountsProblem(f({ kind: 'transfer', to_account_id: 'cushion' }), accounts, START)).toBeNull()
  })
  it('«куда» only for a transfer', () => expect(accountsProblem(f({ to_account_id: 'month' }), accounts, START)).toBe('Куда — только у перевода.'))
  it('history up to the start is not checked; before the start exists, everything after today is', () => {
    expect(accountsProblem(f({ date: START, account_id: 'cushion' }), accounts, START)).toBeNull()
    expect(accountsProblem(f({ account_id: 'cushion' }), accounts, null)).not.toBeNull()
  })
  it('a goal only on «Подушка»', () => {
    expect(goalAccountProblem('cushion', accounts)).toBeNull()
    expect(goalAccountProblem('main', accounts)).toBe('Цель — только на счёте «Подушки».')
    expect(goalAccountProblem(null, accounts)).toBeNull()
  })
  it('choices: in order, archived hidden unless already chosen, one group if asked', () => {
    const list = [acc('b', 'balance', 20), acc('a', 'balance', 10), acc('old', 'balance', 5, true), acc('c', 'cushion', 50)]
    expect(accountOptions(list).map((a) => a.id)).toEqual(['a', 'b', 'c'])
    expect(accountOptions(list, { keep: 'old' }).map((a) => a.id)).toEqual(['old', 'a', 'b', 'c'])
    expect(accountOptions(list, { group: 'cushion' }).map((a) => a.id)).toEqual(['c'])
  })
})

describe('accounts: how «Деньги» see the balance', () => {
  const view = balanceView(txs, accounts, '2026-11-19')
  it('up to the start the common pot, from it «Баланс»', () => {
    expect(view.start).toBe(START)
    expect(view.at('2026-11-17', 'fact')).toBe(99500)
    expect(view.at('2026-11-20', 'fact')).toBe(34000)
  })
  it('without a start — the pot, as before', () => {
    const pot = txs.filter((t) => !(t.kind === 'opening' && t.account_id))
    const v = balanceView(pot, accounts, '2026-11-19')
    expect(v.start).toBeNull()
    expect(v.at('2026-11-20', 'fact')).toBe(balanceAt(pot, '2026-11-20', 'fact', '2026-11-19'))
  })
  it('months: after the start only rows of «Баланс»; the end of a month is «Баланс»; the start month is marked', () => {
    const extra = [...txs, tx({ date: '2026-11-25', kind: 'income', amount_eur: 2, account_id: 'cushion' }), tx({ date: '2026-11-10', kind: 'income', amount_eur: 7 })]
    const v = balanceView(extra, accounts, '2026-11-19')
    const nov = monthsTable(extra, '2026-11-19', '2026-11-30', v).find((m) => m.month === '2026-11')!
    // income: 7 (pot, 10.11); 2 + 2 to «Подушка» after the start do not count
    expect(nov.incomeCents).toBe(700)
    expect(nov.endCents).toBe(v.at('2026-11-30', 'plan'))
    expect(nov.accountsFrom).toBe(START)
    expect(monthsTable(extra, '2026-11-19', '2026-11-30').find((m) => m.month === '2026-11')!.accountsFrom).toBeNull()
  })
  it('the balance line takes the same view', () => {
    const line = balanceLine(txs, START, '2026-11-30', '2026-11-19', 70, view.at)
    expect(line.find((p) => p.key === '2026-11-19')).toMatchObject({ fact: 340, plan: 330 }) // the fact has no week budget, the plan takes what is left of it
  })
})

describe('accounts: reconciliation by account', () => {
  const row = (account_id: string, amount_eur: number, date = '2026-11-22') => ({ date, account_id, amount_eur })
  const all = [row('main', 185), row('month', 150), row('spark', -50), row('cash', 0), row('cushion', 557)]
  it('the latest day; every account within 1 €; «Баланс» as a whole when complete', () => {
    const r = reconcileAccounts([row('main', 1, '2026-11-19'), ...all], txs, accounts)!
    expect(r.date).toBe('2026-11-22')
    expect(r.balance).toEqual({ actualCents: 28500, calculatedCents: 28500, diffCents: 0 })
    expect(r.off).toEqual([])
    expect(r.missing).toEqual(['dep'])
    expect(r.matches).toBe(true)
  })
  it('an account off by 1 € or more is named; «Баланс» incomplete — no whole', () => {
    const r = reconcileAccounts([row('main', 186.5), row('cushion', 557)], txs, accounts)!
    expect(r.off.map((c) => [c.account.id, c.diffCents])).toEqual([['main', 150]])
    expect(r.balance).toBeNull()
    expect(r.matches).toBe(false)
  })
  it('rows before the start, legacy rows without an account, or no start — nothing to reconcile', () => {
    expect(reconcileAccounts([{ date: '2026-11-12', account_id: 'main', amount_eur: 1 }], txs, accounts)).toBeNull()
    expect(reconcileAccounts([{ date: '2026-11-22', account_id: null, amount_eur: 1 }], txs, accounts)).toBeNull()
    expect(reconcileAccounts(all, txs.filter((t) => !(t.kind === 'opening' && t.account_id)), accounts)).toBeNull()
  })
})

describe('accounts: «сейчас» of a goal', () => {
  const goals = [
    { id: 'g1', type: 'goal', archived: false, account_id: 'cushion' },
    { id: 'g2', type: 'goal', archived: false, account_id: 'kz' },
    { id: 'g3', type: 'goal', archived: false, account_id: 'kz' },
    { id: 'g4', type: 'goal', archived: true, account_id: 'cushion' },
  ]
  const accs = [...accounts, acc('kz', 'cushion', 60)]
  it('the only goal on its account — the account balance (archived goals do not share)', () => {
    expect(goalAccountNow(goals[0]!, goals, accs, txs, '2026-11-22')).toEqual({ cents: 55700, account: accs.find((a) => a.id === 'cushion') })
  })
  it('a shared account, no account, or no start — null («Внести остаток» counts)', () => {
    expect(goalAccountNow(goals[1]!, goals, accs, txs, '2026-11-22')).toBeNull()
    expect(goalAccountNow({ id: 'g5', account_id: null }, goals, accs, txs, '2026-11-22')).toBeNull()
    expect(goalAccountNow(goals[0]!, goals, accs, txs, '2026-11-17')).toBeNull()
  })
})

describe('accounts: balances typed in the review', () => {
  it('empty — not entered; below zero only on «Баланс»', () => {
    expect(parseBalanceInput(' ', 'balance')).toEqual({ cents: null })
    expect(parseBalanceInput('−12,50', 'balance')).toEqual({ cents: -1250 })
    expect(parseBalanceInput('-1', 'cushion')).toEqual({ problem: 'Минус — только у счетов «Баланса».' })
    expect(parseBalanceInput('сто', 'balance')).toEqual({ problem: 'Сумма — цифрами, например 120,50.' })
  })
  it('rows for «Остатки»: by account name, valid and not archived only', () => {
    const list = [acc('Основной', 'balance', 10), acc('Подушка', 'cushion', 50), acc('Старый', 'balance', 5, true)]
    const rows = reviewBalances({ Основной: '-3,5', Подушка: '-1', Старый: '7', Revolut: '9' }, list)
    expect(rows.map((r) => [r.account.id, r.amount])).toEqual([['Основной', -3.5]])
  })
})
