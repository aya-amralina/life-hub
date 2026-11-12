/**
 * Care checklist of «Отметка дня», from the glow-up stage (like habits) — products change without code changes.
 * An entry is a plain item («Крем для тела») or a group with one choice: «Вечер: Ниацинамид | Азелаинка».
 * A day stores marks by name: «Крем для тела», «Вечер: Азелаинка».
 */
export const DEFAULT_CARE: readonly string[] = ['Утро: Ниацинамид | Глиняный стик', 'Вечер: Ниацинамид | Азелаинка', 'Крем для тела']

export type CareEntry = { raw: string; label: string; options: string[] | null }

/** «Вечер: Ниацинамид | Азелаинка» → group «Вечер» with two options; anything else — a plain item. */
export function parseCare(raw: string): CareEntry {
  const s = raw.trim()
  const m = /^([^:|]+):\s*(.+\|.+)$/.exec(s)
  if (!m) return { raw: s, label: s, options: null }
  const options = [...new Set(m[2]!.split('|').map((o) => o.trim()).filter(Boolean))]
  return options.length > 1 ? { raw: s, label: m[1]!.trim(), options } : { raw: s, label: s, options: null }
}

/** Care entries of the stage (trimmed, unique); the default list without one. */
export function careItems(stage: { care_items?: string[] | null } | null): CareEntry[] {
  const list = [...new Set((stage?.care_items ?? []).map((s) => s.trim()).filter(Boolean))]
  return (list.length ? list : [...DEFAULT_CARE]).map(parseCare)
}

/** The day's choice in a group («Азелаинка»), or null. */
export function careChoice(marked: readonly string[] | null | undefined, entry: CareEntry): string | null {
  if (!entry.options) return null
  const prefix = `${entry.label}: `
  const mark = (marked ?? []).find((m) => m.startsWith(prefix) && entry.options!.includes(m.slice(prefix.length)))
  return mark ? mark.slice(prefix.length) : null
}

export function isCareDone(marked: readonly string[] | null | undefined, entry: CareEntry): boolean {
  return entry.options ? careChoice(marked, entry) !== null : (marked ?? []).includes(entry.label)
}

/** How many entries of the list are done today (old marks of removed items are kept, not counted). */
export function careDone(marked: readonly string[] | null | undefined, entries: readonly CareEntry[]): number {
  return entries.filter((e) => isCareDone(marked, e)).length
}

/** Tap: a plain item toggles; in a group the option replaces the previous choice, the same option again clears it. */
export function toggleCare(marked: readonly string[] | null | undefined, entry: CareEntry, option?: string): string[] {
  const list = marked ?? []
  if (!entry.options || !option) return list.includes(entry.label) ? list.filter((x) => x !== entry.label) : [...list, entry.label]
  const prefix = `${entry.label}: `
  const rest = list.filter((m) => !(m.startsWith(prefix) && entry.options!.includes(m.slice(prefix.length))))
  return careChoice(list, entry) === option ? rest : [...rest, `${prefix}${option}`]
}

/** For the settings list: «Вечер — Ниацинамид или Азелаинка». */
export function careTitle(entry: CareEntry): string {
  return entry.options ? `${entry.label} — ${entry.options.join(' или ')}` : entry.label
}
