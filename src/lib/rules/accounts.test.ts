import { describe, expect, it } from 'vitest'
import {
  accountBalanceAt,
  accountDelta,
  accountOptions,
  accountsProblem,
  accountsStart,
  goalAccountProblem,
  groupBalanceAt,
  groupDelta,
  groupOfAccount,
  legacyAccountName,
  type AccTx,
  type AccountLike,
} from './accounts'
import { balanceAt } from './money'

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
