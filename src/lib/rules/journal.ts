import { addDaysISO, type ISODate } from '../dates'
import { matchesSearch } from './table'

/**
 * «Заметка дня» as a journal. A note is saved by a button (it appears only when the text differs from the saved
 * one); an unsaved draft is kept on the device so nothing is lost. The journal shows saved notes and «Мысль на
 * неделю» from the Sunday review — newest first, by month, with the day's mood / energy / sleep as a quiet line.
 */

/** Text as stored: trimmed, empty → null. */
export function cleanNote(text: string): string | null {
  const t = text.replace(/\s+$/u, '').replace(/^\s+/u, '')
  return t === '' ? null : t
}

/** Is there something to save: the text differs from the saved one (ignoring outer spaces). */
export function noteDirty(text: string, saved: string | null | undefined): boolean {
  return cleanNote(text) !== (saved ?? null)
}

export type JournalLog = { date: ISODate; note: string | null; mood: number | null; energy: number | null; sleep_h: number | null }
export type JournalWeek = { start_date: ISODate; week_thought: string | null }

export type JournalEntry =
  | { kind: 'day'; date: ISODate; text: string; mood: number | null; energy: number | null; sleep: number | null }
  | { kind: 'week'; date: ISODate; text: string; monday: ISODate }

/** Entries newest first; a week's thought stands on its Sunday, after that day's note. Empty texts are not entries. */
export function journalEntries(logs: readonly JournalLog[], weeks: readonly JournalWeek[]): JournalEntry[] {
  const out: JournalEntry[] = []
  for (const l of logs) {
    const text = l.note?.trim()
    if (text) out.push({ kind: 'day', date: l.date, text, mood: l.mood, energy: l.energy, sleep: l.sleep_h === null ? null : Number(l.sleep_h) })
  }
  for (const w of weeks) {
    const text = w.week_thought?.trim()
    if (text) out.push({ kind: 'week', date: addDaysISO(w.start_date, 6), text, monday: w.start_date })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || (a.kind === b.kind ? 0 : a.kind === 'day' ? -1 : 1))
}

/** By month ('2026-11'), keeping the order. */
export function byMonth<T extends { date: ISODate }>(entries: readonly T[]): { month: string; entries: T[] }[] {
  const out: { month: string; entries: T[] }[] = []
  for (const e of entries) {
    const m = e.date.slice(0, 7)
    const last = out[out.length - 1]
    if (last && last.month === m) last.entries.push(e)
    else out.push({ month: m, entries: [e] })
  }
  return out
}

/** Search in the journal: every word in the text (case and accents ignored). */
export function searchJournal<T extends { text: string }>(entries: readonly T[], query: string): T[] {
  return entries.filter((e) => matchesSearch([e.text], query))
}

/** The quiet line under a day: «настроение 7 · энергия 6 · сон 7,5 ч» — only what was marked. */
export function dayContext(e: { mood: number | null; energy: number | null; sleep: number | null }): string {
  return [e.mood !== null ? `настроение ${e.mood}` : null, e.energy !== null ? `энергия ${e.energy}` : null, e.sleep !== null ? `сон ${String(e.sleep).replace('.', ',')} ч` : null].filter(Boolean).join(' · ')
}

/** Long enough to fold in the journal (about 4 lines on the phone). */
export function longNote(text: string, lines = 4, perLine = 48): boolean {
  return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0) > lines
}
