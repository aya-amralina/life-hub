import { WEEK_CATEGORIES, type WeekCategory } from '../constants'
import { addDaysISO, type ISODate } from '../dates'
import { toCents } from '../format'

export type LimitLike = { category: string; limit_eur: number }
export type TxLike = {
  date: ISODate
  amount_eur: number
  kind: string
  category: string | null
  envelope_id: string | null
  is_planned: boolean
  confirmed_at: string | null
}

export type CategoryWeek = {
  category: WeekCategory
  limitCents: number
  spentCents: number
  /** fact − limit; > 0 = overspend */
  deviationCents: number
  status: 'within' | 'over'
}

export type MoneyWeek = {
  categories: CategoryWeek[]
  limitCents: number
  spentCents: number
  deviationCents: number
  status: 'within' | 'over'
  hasLimits: boolean
}

const isWeekCategory = (c: string | null): c is WeekCategory => c !== null && (WEEK_CATEGORIES as readonly string[]).includes(c)

/** A planned operation counts as fact only once confirmed. */
export function isFact(t: Pick<TxLike, 'is_planned' | 'confirmed_at'>): boolean {
  return !t.is_planned || t.confirmed_at !== null
}

/**
 * Rule 2 «Неделя денег»: fact = Σ expenses with a weekly category and without an envelope (rule 4)
 * within Mon–Sun. Deviation = fact − limit; ≤ 0 «в лимите», > 0 «перерасход».
 */
export function moneyWeek(limits: readonly LimitLike[], txs: readonly TxLike[], weekStart: ISODate): MoneyWeek {
  const weekEnd = addDaysISO(weekStart, 6)
  const spent = new Map<WeekCategory, number>()
  for (const t of txs) {
    if (t.kind !== 'expense' || t.envelope_id !== null || !isWeekCategory(t.category) || !isFact(t)) continue
    if (t.date < weekStart || t.date > weekEnd) continue
    spent.set(t.category, (spent.get(t.category) ?? 0) + toCents(t.amount_eur))
  }
  const limitOf = new Map<WeekCategory, number>()
  for (const l of limits) if (isWeekCategory(l.category)) limitOf.set(l.category, toCents(l.limit_eur))

  const categories = WEEK_CATEGORIES.map((category): CategoryWeek => {
    const limitCents = limitOf.get(category) ?? 0
    const spentCents = spent.get(category) ?? 0
    const deviationCents = spentCents - limitCents
    return { category, limitCents, spentCents, deviationCents, status: deviationCents > 0 ? 'over' : 'within' }
  })
  const limitCents = categories.reduce((s, c) => s + c.limitCents, 0)
  const spentCents = categories.reduce((s, c) => s + c.spentCents, 0)
  const deviationCents = spentCents - limitCents
  return {
    categories,
    limitCents,
    spentCents,
    deviationCents,
    status: deviationCents > 0 ? 'over' : 'within',
    hasLimits: limitOf.size > 0,
  }
}
