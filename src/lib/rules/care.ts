import type { ISODate } from '../dates'
import { activeOn, type DayMarks, type HabitLike, type PlanLike } from './habits'

/**
 * Care of «Отметка дня» — habits of kind `care` (migration 0021). A habit with a group is an option of that group
 * («Вечер»: Ниацинамид | Азелаинка — one choice a day); without a group — a plain item («Крем для тела»).
 */
export type CareOption = { id: string; name: string }
export type CareEntry = { key: string; label: string; id: string | null; options: CareOption[] | null }

/** The day's care list: groups and plain items in the order of their first habit. */
export function careEntries(habits: readonly HabitLike[], plans: readonly PlanLike[], date: ISODate): CareEntry[] {
  const out: CareEntry[] = []
  for (const h of activeOn(habits, plans, date, 'care')) {
    const group = h.group_name?.trim()
    if (!group) {
      out.push({ key: h.id, label: h.name, id: h.id, options: null })
      continue
    }
    const entry = out.find((e) => e.options && e.label === group)
    if (entry) entry.options!.push({ id: h.id, name: h.name })
    else out.push({ key: `group:${group}`, label: group, id: null, options: [{ id: h.id, name: h.name }] })
  }
  return out
}

/** The day's choice in a group, or null. */
export function careChoice(day: DayMarks | null | undefined, entry: CareEntry): CareOption | null {
  return entry.options?.find((o) => day?.done.has(o.id)) ?? null
}

export function isCareDone(day: DayMarks | null | undefined, entry: CareEntry): boolean {
  return entry.options ? careChoice(day, entry) !== null : Boolean(entry.id && day?.done.has(entry.id))
}

/** How many entries of the list are done (a group counts once). */
export function careDone(day: DayMarks | null | undefined, entries: readonly CareEntry[]): number {
  return entries.filter((e) => isCareDone(day, e)).length
}

/**
 * Tap → the marks to write: a plain item toggles; in a group the option replaces the previous choice, the same option
 * again clears it.
 */
export function careToggle(day: DayMarks | null | undefined, entry: CareEntry, optionId?: string): { habit_id: string; done: boolean }[] {
  const has = (id: string) => Boolean(day?.done.has(id))
  if (!entry.options) return entry.id ? [{ habit_id: entry.id, done: !has(entry.id) }] : []
  if (!optionId) return []
  if (has(optionId)) return [{ habit_id: optionId, done: false }]
  return [{ habit_id: optionId, done: true }, ...entry.options.filter((o) => o.id !== optionId && has(o.id)).map((o) => ({ habit_id: o.id, done: false }))]
}

export type ParsedCare = { group: string | null; names: string[] }

/** «Вечер: Ниацинамид | Азелаинка» → a group with two options; anything else — one plain item. For adding in settings. */
export function parseCare(raw: string): ParsedCare {
  const s = raw.trim()
  const m = /^([^:|]+):\s*(.+\|.+)$/.exec(s)
  if (!m) return { group: null, names: s ? [s] : [] }
  const names = [...new Set(m[2]!.split('|').map((o) => o.trim()).filter(Boolean))]
  return names.length > 1 ? { group: m[1]!.trim(), names } : { group: null, names: [s] }
}

/** For the settings list: «Вечер — Ниацинамид или Азелаинка». */
export function careTitle(entry: Pick<CareEntry, 'label' | 'options'>): string {
  return entry.options ? `${entry.label} — ${entry.options.map((o) => o.name).join(' или ')}` : entry.label
}

/** The time of day a new care habit gets from its group. */
export function careTimeOfDay(group: string | null): 'morning' | 'evening' | 'any' {
  const g = group?.toLowerCase() ?? ''
  return g.startsWith('утр') ? 'morning' : g.startsWith('веч') ? 'evening' : 'any'
}
