import { addDaysISO, formatDayMonth, parseISODate, weekStart, weekdayShort, type ISODate } from '../dates'
import { plural, toCents } from '../format'
import { isWeekRow, type TxLike } from './money'
import type { OperationKind } from './operation'
import { answeredByRule, nextDateAfter, nthDate, occurrences, virtualPlanned, type Freq, type OccurrenceLink, type RecurringLike } from './recurring'

/** Recurring rules beyond the plan itself: text, states, the form, a change of the schedule (correction C), linking. */

export const FREQ_LABEL: Record<Freq, string> = { weekly: 'Неделя', monthly: 'Месяц', yearly: 'Год' }

// ───────────────────────────── text ─────────────────────────────

const MONTH_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']
const UNIT: Record<Freq, { every: readonly [string, string, string]; within: readonly [string, string, string]; one: string; withinOne: string }> = {
  weekly: { every: ['неделю', 'недели', 'недель'], within: ['недели', 'недель', 'недель'], one: 'каждую неделю', withinOne: 'недели' },
  monthly: { every: ['месяц', 'месяца', 'месяцев'], within: ['месяца', 'месяцев', 'месяцев'], one: 'каждый месяц', withinOne: 'месяца' },
  yearly: { every: ['год', 'года', 'лет'], within: ['года', 'лет', 'лет'], one: 'каждый год', withinOne: 'года' },
}
const freqOf = (f: string): Freq => (f === 'weekly' || f === 'yearly' ? f : 'monthly')

/** «каждый месяц, 1-го», «каждые 2 недели, пн», «каждый год, 15.03», «каждый месяц, 31-го или в последний день». */
export function describeRule(rule: Pick<RecurringLike, 'freq' | 'interval_n' | 'anchor_date'>): string {
  const f = freqOf(rule.freq)
  const n = Math.max(1, Math.floor(rule.interval_n))
  const every = n === 1 ? UNIT[f].one : `каждые ${n} ${plural(n, UNIT[f].every)}`
  const day = parseISODate(rule.anchor_date).getDate()
  if (f === 'weekly') return `${every}, ${weekdayShort(rule.anchor_date).toLowerCase()}`
  if (f === 'yearly') return `${every}, ${formatDayMonth(rule.anchor_date)}`
  return `${every}, ${day}-го${day > 28 ? ' или в последний день' : ''}`
}

// ───────────────────────────── states ─────────────────────────────

export type RuleState = 'active' | 'paused' | 'ended'

/** «Закончились» — the last allowed day is behind; such rules sit folded in the card. */
export function ruleState(rule: Pick<RecurringLike, 'active' | 'end_date'>, today: ISODate): RuleState {
  if (rule.end_date !== null && rule.end_date < today) return 'ended'
  return rule.active ? 'active' : 'paused'
}

/** The next unanswered occurrence from today on, for the card («следующий — 01.12»); null when none up to `to`. */
export function nextOccurrence(rule: RecurringLike, txs: readonly OccurrenceLink[], today: ISODate, to: ISODate): ISODate | null {
  return virtualPlanned([rule], txs, to).find((v) => v.date >= today)?.date ?? null
}

// ───────────────────────────── the form ─────────────────────────────

export type RecurringForm = {
  title: string
  cents: number | null
  kind: OperationKind
  grp: string | null
  /** expense — «откуда», income — «куда», transfer — «откуда» */
  accountId: string | null
  /** transfer only — «куда» */
  toAccountId: string | null
  envelopeId: string | null
  freq: Freq
  interval: number
  anchor: ISODate
  end: ISODate | null
  active: boolean
  note: string
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** A new rule: a monthly expense from today. */
export function blankRecurring(today: ISODate): RecurringForm {
  return { title: '', cents: null, kind: 'expense', grp: 'Обязательное', accountId: null, toAccountId: null, envelopeId: null, freq: 'monthly', interval: 1, anchor: today, end: null, active: true, note: '' }
}

export function recurringValid(f: RecurringForm): boolean {
  return (
    f.title.trim().length > 0 &&
    f.cents !== null &&
    f.cents > 0 &&
    Number.isInteger(f.interval) &&
    f.interval > 0 &&
    ISO.test(f.anchor) &&
    (f.end === null || (ISO.test(f.end) && f.end >= f.anchor))
  )
}

/** «Сделать регулярным» is offered on a stored planned operation not yet answered, removed or bound to a rule. */
export function canMakeRecurring(t: TxLike & OccurrenceLink & { virtual?: boolean }): boolean {
  return !t.virtual && t.is_planned && t.confirmed_at === null && !t.cancelled_at && !t.recurring_id && !isWeekRow(t) && t.kind !== 'opening'
}

/** A new rule prefilled from a planned operation: its name, sum, kind, group, account, envelope, note; first date — its date. */
export function recurringFromOperation(
  t: Pick<TxLike, 'date' | 'amount_eur' | 'kind' | 'envelope_id' | 'grp'> & { title: string; account_id: string | null; to_account_id?: string | null; note: string | null },
): RecurringForm {
  const kind: OperationKind = t.kind === 'income' ? 'income' : t.kind === 'transfer' ? 'transfer' : 'expense'
  return {
    ...blankRecurring(t.date),
    title: t.title,
    cents: toCents(t.amount_eur),
    kind,
    grp: kind === 'expense' ? (t.grp ?? null) : null,
    accountId: t.account_id,
    toAccountId: kind === 'transfer' ? (t.to_account_id ?? null) : null,
    envelopeId: kind === 'expense' ? t.envelope_id : null,
    note: t.note ?? '',
  }
}

/** The form as a row of `recurring`. Group by kind as for an operation; an envelope only for an expense. */
export function recurringRow(f: RecurringForm) {
  return {
    title: f.title.trim(),
    amount_eur: (f.cents ?? 0) / 100,
    kind: f.kind,
    grp: f.kind === 'income' ? 'Доход' : f.kind === 'transfer' ? null : f.grp,
    account_id: f.accountId,
    to_account_id: f.kind === 'transfer' ? f.toAccountId : null,
    envelope_id: f.kind === 'expense' ? f.envelopeId : null,
    freq: f.freq,
    interval_n: f.interval,
    anchor_date: f.anchor,
    end_date: f.end,
    active: f.active,
    note: f.note.trim() || null,
  }
}
export type RecurringRow = ReturnType<typeof recurringRow>

export function recurringForm(r: RecurringLike): RecurringForm {
  return {
    title: r.title,
    cents: Math.round(Number(r.amount_eur) * 100),
    kind: r.kind === 'income' ? 'income' : r.kind === 'transfer' ? 'transfer' : 'expense',
    grp: r.grp,
    accountId: r.account_id ?? null,
    toAccountId: r.to_account_id ?? null,
    envelopeId: r.envelope_id,
    freq: freqOf(r.freq),
    interval: r.interval_n,
    anchor: r.anchor_date,
    end: r.end_date,
    active: r.active,
    note: r.note ?? '',
  }
}

// ───────────────────────────── changing the schedule (decision 16.11.2026, correction C) ─────────────────────────────

/** The latest occurrence of the rule a real row answers, or null. */
export function lastAnswered(ruleId: string, txs: readonly OccurrenceLink[]): ISODate | null {
  let last: ISODate | null = null
  for (const t of txs) if (t.recurring_id === ruleId && t.occurrence_date && (last === null || t.occurrence_date > last)) last = t.occurrence_date
  return last
}

/** First date, frequency or interval — what decides which dates the rule has. */
export function scheduleChanged(prev: Pick<RecurringLike, 'freq' | 'interval_n' | 'anchor_date'>, next: Pick<RecurringForm, 'freq' | 'interval' | 'anchor'>): boolean {
  return prev.freq !== next.freq || prev.interval_n !== next.interval || prev.anchor_date !== next.anchor
}

/** Suggested first date of a new schedule: the old schedule's next date after the last answer (its next period). */
export function suggestedAnchor(rule: RecurringLike, txs: readonly OccurrenceLink[]): ISODate {
  const last = lastAnswered(rule.id, txs)
  return last === null ? rule.anchor_date : nextDateAfter(rule, last)
}

/**
 * The first date while frequency or interval is being changed in the form. After answers, a new rhythm whose
 * first date is not past the last answer gets the suggested one (the old schedule's next period); when the
 * rhythm goes back to the rule's own, a date the form chose itself goes back too. `auto` — the current date was
 * chosen by the form, not typed.
 */
export function anchorForRhythm(
  rule: RecurringLike,
  txs: readonly OccurrenceLink[],
  next: Pick<RecurringForm, 'freq' | 'interval' | 'anchor'>,
  auto: boolean,
): { anchor: ISODate; auto: boolean } {
  const last = lastAnswered(rule.id, txs)
  if (last === null) return { anchor: next.anchor, auto }
  const same = next.freq === rule.freq && next.interval === rule.interval_n
  if (same) return auto ? { anchor: rule.anchor_date, auto: false } : { anchor: next.anchor, auto }
  if (next.anchor <= last) return { anchor: suggestedAnchor(rule, txs), auto: true }
  return { anchor: next.anchor, auto }
}

export type RuleSave =
  /** no answers yet, or the schedule is the same: the rule is edited as is */
  | { mode: 'in_place'; id: string; row: RecurringRow }
  /** answers exist and the schedule changed: the old rule ends the day before the new first date, a new one starts */
  | { mode: 'split'; close: { id: string; end_date: ISODate }; create: RecurringRow }
  /** the new first date is not after the last answer — it would count an answered occurrence twice */
  | { mode: 'invalid'; reason: string; minDate: ISODate }

/**
 * How an edit of a rule is saved. A rule whose occurrences were never answered is simply edited. Once an answer
 * exists, a change of the schedule closes the old rule and starts a new one, so the answered past keeps its dates;
 * the new first date must then be after the last answer (hard rule). Everything else is edited in place.
 */
export function planRuleSave(prev: RecurringLike, f: RecurringForm, txs: readonly OccurrenceLink[]): RuleSave {
  const row = recurringRow(f)
  const last = lastAnswered(prev.id, txs)
  if (last === null || !scheduleChanged(prev, f)) return { mode: 'in_place', id: prev.id, row }
  if (f.anchor <= last) {
    return { mode: 'invalid', reason: `Первая дата — после ${formatDayMonth(last)}: до неё уже есть ответы.`, minDate: addDaysISO(last, 1) }
  }
  const dayBefore = addDaysISO(f.anchor, -1)
  const end = prev.end_date !== null && prev.end_date < dayBefore ? prev.end_date : dayBefore
  return { mode: 'split', close: { id: prev.id, end_date: end }, create: row }
}

/**
 * A new first date closer than one interval of the new schedule to the last answer is allowed but asked about:
 * «каждый месяц», answer 01.12, new first date 20.12 → «В декабре уже есть ответ 01.12. Точно ещё и 20.12?».
 */
export function scheduleWarning(prev: RecurringLike, f: Pick<RecurringForm, 'freq' | 'interval' | 'anchor'>, txs: readonly OccurrenceLink[]): string | null {
  const last = lastAnswered(prev.id, txs)
  if (last === null || !scheduleChanged(prev, f) || f.anchor <= last) return null
  const oneLater = nthDate({ freq: f.freq, interval_n: f.interval, anchor_date: last }, 1)
  if (f.anchor >= oneLater) return null
  const ask = `Точно ещё и ${formatDayMonth(f.anchor)}?`
  const answer = `ответ ${formatDayMonth(last)}`
  if (f.interval === 1 && f.freq === 'monthly' && f.anchor.slice(0, 7) === last.slice(0, 7)) {
    return `В ${MONTH_IN[Number(last.slice(5, 7)) - 1]} уже есть ${answer}. ${ask}`
  }
  if (f.interval === 1 && f.freq === 'yearly' && f.anchor.slice(0, 4) === last.slice(0, 4)) return `В ${last.slice(0, 4)} году уже есть ${answer}. ${ask}`
  if (f.interval === 1 && f.freq === 'weekly' && weekStart(f.anchor) === weekStart(last)) return `На этой неделе уже есть ${answer}. ${ask}`
  const n = f.interval
  const span = n === 1 ? UNIT[f.freq].withinOne : `${n} ${plural(n, UNIT[f.freq].within)}`
  return `Уже есть ${answer} — до ${formatDayMonth(f.anchor)} меньше ${span}. ${ask}`
}

// ───────────────────────────── linking existing rows (only after confirmation) ─────────────────────────────

const LINK_WINDOW_DAYS: Record<Freq, number> = { weekly: 3, monthly: 10, yearly: 20 }
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export type LinkCandidate<T> = { tx: T; occurrence: ISODate }

/**
 * Operations already in the base that look like occurrences of a new rule («Уже есть в плане»): same kind,
 * the title equal or one inside the other, the date near an unanswered occurrence; not linked, not cancelled,
 * not week rows. Each occurrence gets at most the closest row, each row at most one occurrence. Only suggested —
 * nothing is linked until the user confirms.
 */
export function linkCandidates<T extends TxLike & OccurrenceLink & { id: string; title: string }>(
  rule: RecurringLike,
  txs: readonly T[],
  to: ISODate,
): LinkCandidate<T>[] {
  const title = norm(rule.title)
  const similar = (t: string) => {
    const x = norm(t)
    return x === title || (Math.min(x.length, title.length) >= 3 && (x.includes(title) || title.includes(x)))
  }
  const pool = txs.filter(
    (t) => !t.recurring_id && !t.cancelled_at && t.kind === rule.kind && t.entry_kind !== 'week_budget' && t.entry_kind !== 'week_total' && similar(t.title),
  )
  const answered = answeredByRule(txs).get(rule.id)
  const window = LINK_WINDOW_DAYS[freqOf(rule.freq)]
  const used = new Set<string>()
  const out: LinkCandidate<T>[] = []
  for (const d of occurrences({ ...rule, active: true }, rule.anchor_date, to)) {
    if (answered?.has(d)) continue
    const dist = (t: T) => Math.abs(parseISODate(t.date).getTime() - parseISODate(d).getTime()) / 86_400_000
    const best = pool
      .filter((t) => !used.has(t.id) && dist(t) <= window)
      .sort((a, b) => dist(a) - dist(b) || a.id.localeCompare(b.id))[0]
    if (!best) continue
    used.add(best.id)
    out.push({ tx: best, occurrence: d })
  }
  return out
}
