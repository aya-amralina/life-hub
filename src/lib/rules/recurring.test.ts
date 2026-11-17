import { describe, expect, it } from 'vitest'
import { confirmPatch } from './operation'
import { balanceAt, monthsTable, plannedQuestions, upcomingPlanned } from './money'
import {
  describeRule,
  isVirtual,
  lastAnswered,
  linkCandidates,
  materialize,
  nextOccurrence,
  occurrences,
  planRuleSave,
  recurringForm,
  recurringRow,
  recurringValid,
  ruleState,
  scheduleWarning,
  suggestedAnchor,
  virtualPlanned,
  withRecurring,
  type RecurringForm,
  type RecurringLike,
} from './recurring'

const rule = (p: Partial<RecurringLike> = {}): RecurringLike => ({
  id: 'r1',
  title: 'Miete',
  amount_eur: 650,
  kind: 'expense',
  grp: 'Обязательное',
  account: 'Sparkasse',
  envelope_id: null,
  freq: 'monthly',
  interval_n: 1,
  anchor_date: '2026-12-01',
  end_date: null,
  active: true,
  note: null,
  ...p,
})

const tx = (id: string, date: string, kind: string, amount_eur: number, p: Record<string, unknown> = {}) => ({
  id,
  date,
  kind,
  amount_eur,
  title: 'x',
  category: null,
  envelope_id: null,
  is_planned: false,
  confirmed_at: null,
  cancelled_at: null,
  entry_kind: 'one_off',
  grp: null,
  recurring_id: null as string | null,
  occurrence_date: null as string | null,
  ...p,
})

describe('occurrence dates', () => {
  it('monthly on the 31st: the last day in short months, back to the 31st after', () => {
    expect(occurrences(rule({ anchor_date: '2027-01-31' }), '2027-01-01', '2027-05-31')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31'])
  })
  it('a leap year gives 29.02', () => {
    expect(occurrences(rule({ anchor_date: '2028-01-31' }), '2028-02-01', '2028-02-29')).toEqual(['2028-02-29'])
    expect(occurrences(rule({ anchor_date: '2028-02-29', freq: 'yearly' }), '2028-01-01', '2032-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ])
  })
  it('every N months / weeks / years', () => {
    expect(occurrences(rule({ anchor_date: '2026-11-15', interval_n: 2 }), '2026-11-01', '2027-05-31')).toEqual(['2026-11-15', '2027-01-15', '2027-03-15', '2027-05-15'])
    expect(occurrences(rule({ anchor_date: '2026-11-16', freq: 'weekly', interval_n: 2 }), '2026-11-01', '2026-12-31')).toEqual(['2026-11-16', '2026-11-30', '2026-12-14', '2026-12-28'])
    expect(occurrences(rule({ anchor_date: '2026-03-01', freq: 'yearly' }), '2026-01-01', '2028-12-31')).toEqual(['2026-03-01', '2027-03-01', '2028-03-01'])
  })
  it('only within the range, never past the end date, none before the first date', () => {
    expect(occurrences(rule({ end_date: '2027-02-15' }), '2027-01-01', '2027-05-31')).toEqual(['2027-01-01', '2027-02-01'])
    expect(occurrences(rule({ end_date: '2027-02-01' }), '2026-01-01', '2027-05-31')).toEqual(['2026-12-01', '2027-01-01', '2027-02-01'])
  })
  it('a paused rule has none', () => expect(occurrences(rule({ active: false }), '2026-01-01', '2027-05-31')).toEqual([]))
})

describe('virtual planned operations', () => {
  const to = '2027-02-28'
  it('one per occurrence, shaped as a planned operation, marked virtual', () => {
    const v = virtualPlanned([rule()], [], to)
    expect(v.map((x) => x.date)).toEqual(['2026-12-01', '2027-01-01', '2027-02-01'])
    expect(v[0]).toMatchObject({ id: 'rec:r1:2026-12-01', virtual: true, recurring_id: 'r1', occurrence_date: '2026-12-01', amount_eur: 650, is_planned: true, confirmed_at: null, cancelled_at: null, entry_kind: 'one_off' })
    expect(isVirtual(v[0]!)).toBe(true)
    expect(isVirtual(tx('t', '2026-12-01', 'expense', 1))).toBe(false)
  })
  it('a real row of the occurrence closes it — confirmed, moved to another day or cancelled', () => {
    const txs = [
      tx('a', '2026-12-01', 'expense', 650, { is_planned: true, confirmed_at: 'x', recurring_id: 'r1', occurrence_date: '2026-12-01' }),
      tx('b', '2027-01-05', 'expense', 650, { is_planned: true, recurring_id: 'r1', occurrence_date: '2027-01-01' }), // moved
      tx('c', '2027-02-01', 'expense', 650, { is_planned: true, cancelled_at: 'x', recurring_id: 'r1', occurrence_date: '2027-02-01' }),
    ]
    expect(virtualPlanned([rule()], txs, to)).toEqual([])
  })
  it('a row of another rule or without a link does not close it', () => {
    const txs = [tx('a', '2026-12-01', 'expense', 650, { recurring_id: 'r2', occurrence_date: '2026-12-01' }), tx('b', '2027-01-01', 'expense', 650, { title: 'Miete' })]
    expect(virtualPlanned([rule()], txs, to)).toHaveLength(3)
  })
  it('a paused rule hides its unanswered occurrences, past ones too; answered rows stay', () => {
    const answered = tx('a', '2026-12-01', 'expense', 650, { is_planned: true, confirmed_at: 'x', recurring_id: 'r1', occurrence_date: '2026-12-01' })
    expect(withRecurring([answered], [rule({ active: false })], to)).toEqual([answered])
  })
  it('kind decides group and envelope as for an operation', () => {
    expect(virtualPlanned([rule({ kind: 'income', grp: 'Жизнь', envelope_id: 'e' })], [], '2026-12-31')[0]).toMatchObject({ grp: 'Доход', envelope_id: null })
    expect(virtualPlanned([rule({ kind: 'transfer', grp: 'Жизнь' })], [], '2026-12-31')[0]!.grp).toBeNull()
  })
})

describe('virtual operations in the plan: balance, months, questions — no double counting', () => {
  const today = '2026-12-10'
  const to = '2027-02-28'
  const base = [tx('o', '2026-10-13', 'opening', 3000)]
  it('the plan counts every occurrence; the fact none', () => {
    const all = withRecurring(base, [rule()], to)
    expect(balanceAt(all, to, 'plan', today)).toBe(300000 - 3 * 65000)
    expect(balanceAt(all, to, 'fact', today)).toBe(300000)
  })
  it('an answered occurrence counts once — as its real row, with the corrected amount', () => {
    const [v] = virtualPlanned([rule()], base, to)
    const real = materialize(v!, 't-dec', confirmPatch(v!, 67000, '2026-12-01T09:00:00Z'))
    const all = withRecurring([...base, real], [rule()], to)
    expect(all.filter((t) => t.date.startsWith('2026-12') && t.kind === 'expense')).toHaveLength(1)
    expect(balanceAt(all, to, 'plan', today)).toBe(300000 - 67000 - 2 * 65000)
    expect(balanceAt(all, to, 'fact', today)).toBe(300000 - 67000)
  })
  it('a cancelled occurrence leaves the plan', () => {
    const [v] = virtualPlanned([rule()], base, to)
    const all = withRecurring([...base, materialize(v!, 't', { cancelled_at: 'x' })], [rule()], to)
    expect(balanceAt(all, to, 'plan', today)).toBe(300000 - 2 * 65000)
  })
  it('a past unanswered occurrence asks «Списалось?», later ones are «Дальше по плану»', () => {
    const all = withRecurring(base, [rule(), rule({ id: 'r2', title: 'Gehalt', kind: 'income', amount_eur: 1100, anchor_date: '2026-11-27' })], to)
    expect(plannedQuestions(all, today).map((q) => [q.tx.id, q.question])).toEqual([
      ['rec:r2:2026-11-27', 'Пришло?'],
      ['rec:r1:2026-12-01', 'Списалось?'],
    ])
    expect(upcomingPlanned(all, today).map((t) => t.id)).toEqual(['rec:r2:2026-12-27', 'rec:r1:2027-01-01', 'rec:r2:2027-01-27', 'rec:r1:2027-02-01', 'rec:r2:2027-02-27'])
  })
  it('months table sees them', () => {
    const rows = monthsTable(withRecurring(base, [rule()], to), today, to)
    expect(rows.map((r) => [r.month, r.expenseCents, r.hasPlan])).toEqual([
      ['2026-10', 0, false],
      ['2026-11', 0, false],
      ['2026-12', 65000, true],
      ['2027-01', 65000, true],
      ['2027-02', 65000, true],
    ])
    expect(rows.at(-1)!.endCents).toBe(300000 - 3 * 65000)
  })
  it('week budgets (rule 26) keep working next to virtual rows', () => {
    const txs = [
      ...base,
      tx('w', '2026-12-07', 'expense', 100, { is_planned: true, entry_kind: 'week_budget', grp: 'Жизнь' }), // current week
      tx('c', '2026-12-08', 'expense', 30, { confirmed_at: 'x', category: 'Продукты', grp: 'Жизнь' }),
    ]
    // 3000 − 30 spent − 70 rest of the week budget − 650 (December rent)
    expect(balanceAt(withRecurring(txs, [rule()], '2026-12-31'), '2026-12-31', 'plan', today)).toBe(300000 - 3000 - 7000 - 65000)
  })
})

describe('answering a virtual operation makes a real row', () => {
  const [v] = virtualPlanned([rule()], [], '2026-12-31')
  it('confirm: the plan amount is kept, the occurrence linked', () => {
    expect(materialize(v!, 'new-id', confirmPatch(v!, 67000, 'now'))).toMatchObject({
      id: 'new-id',
      date: '2026-12-01',
      title: 'Miete',
      amount_eur: 670,
      planned_amount_eur: 650,
      confirmed_at: 'now',
      is_planned: true,
      recurring_id: 'r1',
      occurrence_date: '2026-12-01',
    })
  })
  it('another day moves the row, not the occurrence; the answer cannot unlink it', () => {
    const row = materialize(v!, 'id', { date: '2026-12-04', recurring_id: null, occurrence_date: '2026-12-04' })
    expect(row).toMatchObject({ date: '2026-12-04', recurring_id: 'r1', occurrence_date: '2026-12-01', confirmed_at: null })
    expect(row).not.toHaveProperty('virtual')
  })
})

describe('describing a rule', () => {
  it('in words', () => {
    expect(describeRule(rule())).toBe('каждый месяц, 1-го')
    expect(describeRule(rule({ anchor_date: '2027-01-31' }))).toBe('каждый месяц, 31-го или в последний день')
    expect(describeRule(rule({ interval_n: 3 }))).toBe('каждые 3 месяца, 1-го')
    expect(describeRule(rule({ freq: 'weekly', anchor_date: '2026-11-16' }))).toBe('каждую неделю, пн')
    expect(describeRule(rule({ freq: 'weekly', interval_n: 2, anchor_date: '2026-11-20' }))).toBe('каждые 2 недели, пт')
    expect(describeRule(rule({ freq: 'yearly', anchor_date: '2027-03-15' }))).toBe('каждый год, 15.03')
    expect(describeRule(rule({ freq: 'yearly', interval_n: 5 }))).toBe('каждые 5 лет, 1.12')
  })
  it('state: active, paused, ended (the last day is behind)', () => {
    expect(ruleState(rule(), '2026-12-10')).toBe('active')
    expect(ruleState(rule({ active: false }), '2026-12-10')).toBe('paused')
    expect(ruleState(rule({ end_date: '2026-12-09' }), '2026-12-10')).toBe('ended')
    expect(ruleState(rule({ end_date: '2026-12-10' }), '2026-12-10')).toBe('active')
  })
  it('next unanswered occurrence from today', () => {
    const answered = [tx('a', '2027-01-01', 'expense', 650, { recurring_id: 'r1', occurrence_date: '2027-01-01' })]
    expect(nextOccurrence(rule(), answered, '2026-12-10', '2027-05-31')).toBe('2027-02-01')
    expect(nextOccurrence(rule({ end_date: '2026-12-31' }), [], '2026-12-10', '2027-05-31')).toBeNull()
  })
})

describe('the rule form', () => {
  const form = (p: Partial<RecurringForm> = {}): RecurringForm => ({ ...recurringForm(rule()), ...p })
  it('a stored rule round-trips through the form', () => {
    const { id: _id, ...stored } = rule({ note: 'Kaltmiete + NK', end_date: '2027-06-30', interval_n: 2 })
    expect(recurringRow(recurringForm({ id: 'r1', ...stored }))).toEqual(stored)
  })
  it('valid: a name, a sum, a whole interval ≥ 1, an end not before the start', () => {
    expect(recurringValid(form())).toBe(true)
    expect(recurringValid(form({ title: ' ' }))).toBe(false)
    expect(recurringValid(form({ cents: 0 }))).toBe(false)
    expect(recurringValid(form({ interval: 0 }))).toBe(false)
    expect(recurringValid(form({ interval: 1.5 }))).toBe(false)
    expect(recurringValid(form({ end: '2026-11-30' }))).toBe(false)
    expect(recurringValid(form({ end: '2026-12-01' }))).toBe(true)
  })
  it('row: trimmed, group by kind, envelope only for an expense', () => {
    expect(recurringRow(form({ title: ' Miete ', note: ' ' }))).toMatchObject({ title: 'Miete', note: null, amount_eur: 650, interval_n: 1, anchor_date: '2026-12-01' })
    expect(recurringRow(form({ kind: 'income', envelopeId: 'e' }))).toMatchObject({ grp: 'Доход', envelope_id: null })
  })
})

describe('changing a rule (correction C)', () => {
  const r = rule({ anchor_date: '2026-10-01' })
  const answers = [
    tx('a', '2026-10-01', 'expense', 650, { recurring_id: 'r1', occurrence_date: '2026-10-01' }),
    tx('b', '2026-12-03', 'expense', 650, { recurring_id: 'r1', occurrence_date: '2026-12-01' }), // moved, still the December one
    tx('x', '2027-01-01', 'expense', 650, { recurring_id: 'r2', occurrence_date: '2027-01-01' }),
  ]
  const f = (p: Partial<RecurringForm> = {}): RecurringForm => ({ ...recurringForm(r), ...p })

  it('the last answer is by occurrence, of this rule only', () => expect(lastAnswered('r1', answers)).toBe('2026-12-01'))

  it('a rule without answers is edited in place, even its schedule', () => {
    expect(planRuleSave(r, f({ anchor: '2026-10-20', freq: 'weekly' }), [])).toMatchObject({ mode: 'in_place', id: 'r1', row: { anchor_date: '2026-10-20', freq: 'weekly' } })
  })
  it('amount, title, account, pause — in place, answers or not', () => {
    expect(planRuleSave(r, f({ cents: 70000, title: 'Warmmiete', active: false }), answers)).toMatchObject({ mode: 'in_place', row: { amount_eur: 700, title: 'Warmmiete', active: false } })
  })
  it('with answers, a new schedule closes the old rule the day before and starts a new one', () => {
    expect(planRuleSave(r, f({ anchor: '2027-01-15' }), answers)).toEqual({
      mode: 'split',
      close: { id: 'r1', end_date: '2027-01-14' },
      create: recurringRow(f({ anchor: '2027-01-15' })),
    })
    expect(planRuleSave(r, f({ anchor: '2027-01-01', interval: 2 }), answers)).toMatchObject({ mode: 'split', close: { end_date: '2026-12-31' } })
  })
  it('an earlier end of the old rule is kept', () => {
    expect(planRuleSave({ ...r, end_date: '2026-12-20' }, f({ anchor: '2027-01-15', end: null }), answers)).toMatchObject({ close: { end_date: '2026-12-20' } })
  })
  it('the new first date must be after the last answer — a hard rule', () => {
    for (const anchor of ['2026-12-01', '2026-11-20', '2026-09-01']) {
      expect(planRuleSave(r, f({ anchor }), answers)).toEqual({ mode: 'invalid', reason: 'Первая дата — после 1.12: до неё уже есть ответы.', minDate: '2026-12-02' })
    }
  })
  it('after a split the answered past keeps its dates and nothing counts twice', () => {
    const save = planRuleSave(r, f({ anchor: '2027-01-15' }), answers)
    if (save.mode !== 'split') throw new Error(save.mode)
    const closed = { ...r, end_date: save.close.end_date }
    const fresh = { ...save.create, id: 'r3' }
    const v = virtualPlanned([closed, fresh], answers, '2027-03-31')
    // November is still unanswered (asks), December is answered, January moves to the 15th
    expect(v.map((x) => x.id)).toEqual(['rec:r1:2026-11-01', 'rec:r1:2027-01-01', 'rec:r3:2027-01-15', 'rec:r3:2027-02-15', 'rec:r3:2027-03-15'])
  })

  it('suggests the next period after the last answer', () => {
    expect(suggestedAnchor(r, answers)).toBe('2027-01-01')
    expect(suggestedAnchor(r, [])).toBe('2026-10-01')
    expect(suggestedAnchor(rule({ freq: 'weekly', anchor_date: '2026-11-02' }), [tx('w', '2026-11-16', 'expense', 1, { recurring_id: 'r1', occurrence_date: '2026-11-16' })])).toBe('2026-11-23')
  })

  it('warns, without forbidding, when the new date is closer than one interval to the last answer', () => {
    expect(scheduleWarning(r, f({ anchor: '2026-12-20' }), answers)).toBe('В декабре уже есть ответ 1.12. Точно ещё и 20.12?')
    expect(planRuleSave(r, f({ anchor: '2026-12-20' }), answers).mode).toBe('split')
    expect(scheduleWarning(r, f({ anchor: '2026-12-31' }), answers)).toBe('В декабре уже есть ответ 1.12. Точно ещё и 31.12?')
    expect(scheduleWarning(r, f({ anchor: '2026-12-25', freq: 'weekly' }), answers)).toBeNull() // a week later is a whole interval
    expect(scheduleWarning(r, f({ anchor: '2026-12-05', freq: 'weekly' }), answers)).toBe('На этой неделе уже есть ответ 1.12. Точно ещё и 5.12?')
  })
  it('no warning a whole interval later, without answers, without a schedule change, or when the date is invalid anyway', () => {
    expect(scheduleWarning(r, f({ anchor: '2027-01-01', freq: 'monthly', interval: 1, end: '2027-12-31' }), answers)).toBeNull() // exactly one month
    expect(scheduleWarning(r, f({ anchor: '2027-02-01', interval: 2 }), answers)).toBeNull()
    expect(scheduleWarning(r, f({ anchor: '2027-01-01', interval: 2 }), answers)).toBe('Уже есть ответ 1.12 — до 1.01 меньше 2 месяцев. Точно ещё и 1.01?')
    expect(scheduleWarning(r, f({ anchor: '2026-12-20' }), [])).toBeNull()
    expect(scheduleWarning(r, f(), answers)).toBeNull()
    expect(scheduleWarning(r, f({ anchor: '2026-11-20' }), answers)).toBeNull()
  })
  it('within the interval but in the next month: says how close', () => {
    expect(scheduleWarning(r, f({ anchor: '2026-12-20', interval: 2 }), answers)).toBe('Уже есть ответ 1.12 — до 20.12 меньше 2 месяцев. Точно ещё и 20.12?')
    expect(scheduleWarning({ ...r }, f({ anchor: '2026-12-28' }), [tx('a', '2026-11-30', 'expense', 1, { recurring_id: 'r1', occurrence_date: '2026-11-30' })])).toBe(
      'Уже есть ответ 30.11 — до 28.12 меньше месяца. Точно ещё и 28.12?',
    )
  })
})

describe('linking existing operations to a new rule (suggested only)', () => {
  const r = rule({ anchor_date: '2026-10-01' })
  const to = '2027-01-31'
  const txs = [
    tx('oct', '2026-10-01', 'expense', 650, { title: 'Miete' }),
    tx('nov', '2026-11-02', 'expense', 650, { title: 'Miete November', is_planned: true, confirmed_at: 'x' }),
    tx('dec', '2026-12-01', 'expense', 650, { title: 'miete', is_planned: true }),
    tx('dec2', '2026-12-05', 'expense', 650, { title: 'Miete', is_planned: true }), // second one near December: not taken
    tx('jan-c', '2027-01-01', 'expense', 650, { title: 'Miete', is_planned: true, cancelled_at: 'x' }),
    tx('inc', '2026-11-01', 'income', 650, { title: 'Miete' }), // other kind
    tx('far', '2026-11-20', 'expense', 650, { title: 'Miete' }), // too far from 01.11 and 01.12
    tx('lnk', '2026-11-01', 'expense', 650, { title: 'Miete', recurring_id: 'r9', occurrence_date: '2026-11-01' }),
    tx('wk', '2026-12-01', 'expense', 650, { title: 'Miete', entry_kind: 'week_budget' }),
  ]
  it('same kind, similar title, near an occurrence; closest first; each once', () => {
    expect(linkCandidates(r, txs, to).map((c) => [c.occurrence, c.tx.id])).toEqual([
      ['2026-10-01', 'oct'],
      ['2026-11-01', 'nov'],
      ['2026-12-01', 'dec'],
    ])
  })
  it('an occurrence already answered is not offered again', () => {
    const answered = [...txs, tx('a', '2026-10-01', 'expense', 650, { title: 'Miete', recurring_id: 'r1', occurrence_date: '2026-10-01' })]
    expect(linkCandidates(r, answered, to).map((c) => c.occurrence)).toEqual(['2026-11-01', '2026-12-01'])
  })
})
