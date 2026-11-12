import { CANCEL_STATUS, type Sphere } from '../constants'
import type { ISODate } from '../dates'

/**
 * Table view (laptop, ≥ 1024 px) for Work and Study: sorting, search, grouping, range selection, cell navigation
 * and the patches of bulk actions — pure functions, the screens only render. A few hundred rows: no virtualisation.
 */

export type SortDir = 'asc' | 'desc'
export type Sort = { col: string; dir: SortDir } | null
export type Cell = string | number | boolean | null | undefined

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })

/** Compare two cell values: empty last in both directions, numbers as numbers, text by German collation. */
export function compareCells(a: Cell, b: Cell, dir: SortDir): number {
  const empty = (v: Cell) => v === null || v === undefined || v === ''
  if (empty(a) && empty(b)) return 0
  if (empty(a)) return 1
  if (empty(b)) return -1
  const k = dir === 'asc' ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * k
  if (typeof a === 'boolean' && typeof b === 'boolean') return (Number(a) - Number(b)) * k
  return collator.compare(String(a), String(b)) * k
}

/** Stable sort by one column; no sort keeps the given order. */
export function sortRows<T>(rows: readonly T[], sort: Sort, value: (row: T, col: string) => Cell): T[] {
  if (!sort) return [...rows]
  return rows
    .map((row, i) => ({ row, i }))
    .sort((x, y) => compareCells(value(x.row, sort.col), value(y.row, sort.col), sort.dir) || x.i - y.i)
    .map((x) => x.row)
}

/** Header click: none → ascending → descending → none. */
export function nextSort(sort: Sort, col: string): Sort {
  if (!sort || sort.col !== col) return { col, dir: 'asc' }
  return sort.dir === 'asc' ? { col, dir: 'desc' } : null
}

/** Search: every word must occur in one of the row's texts (case- and accent-insensitive). */
export function matchesSearch(texts: readonly (string | null | undefined)[], query: string): boolean {
  const norm = (s: string) => s.toLocaleLowerCase('de').normalize('NFD').replace(/\p{M}/gu, '')
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = norm(texts.filter(Boolean).join(' \u0001 '))
  return words.every((w) => hay.includes(w))
}

export type Group<T> = { key: string; label: string; rows: T[] }

/**
 * Group rows by a key, keeping the row order inside a group. Groups follow `order` (known keys first, in that order),
 * then the rest alphabetically; rows without a key go to a last group «label of empty».
 */
export function groupRows<T>(rows: readonly T[], key: (row: T) => string | null, opts: { order?: readonly string[]; label?: (k: string) => string; emptyLabel: string }): Group<T>[] {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r) ?? ''
    map.set(k, [...(map.get(k) ?? []), r])
  }
  const order = opts.order ?? []
  const keys = [...map.keys()].sort((a, b) => {
    if (a === '') return 1
    if (b === '') return -1
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib)
    return collator.compare(a, b)
  })
  return keys.map((k) => ({ key: k, label: k === '' ? opts.emptyLabel : (opts.label?.(k) ?? k), rows: map.get(k)! }))
}

/**
 * Row selection by click: a plain click toggles the row and sets the anchor; Shift-click selects the whole range
 * between the anchor and the row (in the visible order), as the anchor's state says.
 */
export function selectClick(order: readonly string[], selected: ReadonlySet<string>, anchor: string | null, id: string, shift: boolean): { selected: Set<string>; anchor: string } {
  const next = new Set(selected)
  if (shift && anchor !== null && order.includes(anchor) && order.includes(id)) {
    const from = Math.min(order.indexOf(anchor), order.indexOf(id))
    const to = Math.max(order.indexOf(anchor), order.indexOf(id))
    const on = selected.has(anchor)
    for (const rid of order.slice(from, to + 1)) {
      if (on) next.add(rid)
      else next.delete(rid)
    }
    return { selected: next, anchor }
  }
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return { selected: next, anchor: id }
}

export type Pos = { row: number; col: number }

/** Keyboard move of the active cell: arrows stop at the edges; Tab / Shift-Tab wrap to the next / previous row. */
export function moveCell(pos: Pos, key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Tab' | 'ShiftTab' | 'Home' | 'End', rows: number, cols: number): Pos {
  if (rows === 0 || cols === 0) return pos
  const clamp = (p: Pos): Pos => ({ row: Math.min(rows - 1, Math.max(0, p.row)), col: Math.min(cols - 1, Math.max(0, p.col)) })
  switch (key) {
    case 'ArrowUp':
      return clamp({ ...pos, row: pos.row - 1 })
    case 'ArrowDown':
      return clamp({ ...pos, row: pos.row + 1 })
    case 'ArrowLeft':
      return clamp({ ...pos, col: pos.col - 1 })
    case 'ArrowRight':
      return clamp({ ...pos, col: pos.col + 1 })
    case 'Home':
      return clamp({ ...pos, col: 0 })
    case 'End':
      return clamp({ ...pos, col: cols - 1 })
    case 'Tab':
      if (pos.col < cols - 1) return { ...pos, col: pos.col + 1 }
      return pos.row < rows - 1 ? { row: pos.row + 1, col: 0 } : pos
    case 'ShiftTab':
      if (pos.col > 0) return { ...pos, col: pos.col - 1 }
      return pos.row > 0 ? { row: pos.row - 1, col: cols - 1 } : pos
  }
}

/** Column settings kept on the device: hidden columns and widths (px), clamped to sane bounds. */
export type ColumnPrefs = { hidden: string[]; widths: Record<string, number> }
export const MIN_COL = 56
export const MAX_COL = 640

export function parsePrefs(raw: string | null, known: readonly string[]): ColumnPrefs {
  try {
    const p = JSON.parse(raw ?? '') as Partial<ColumnPrefs>
    const hidden = Array.isArray(p.hidden) ? p.hidden.filter((c): c is string => typeof c === 'string' && known.includes(c)) : []
    const widths: Record<string, number> = {}
    for (const [k, v] of Object.entries(p.widths ?? {})) if (known.includes(k) && typeof v === 'number' && Number.isFinite(v)) widths[k] = clampWidth(v)
    return { hidden, widths }
  } catch {
    return { hidden: [], widths: {} }
  }
}

export function clampWidth(w: number): number {
  return Math.round(Math.min(MAX_COL, Math.max(MIN_COL, w)))
}

/** «Beteiligte» typed as text: comma- or semicolon-separated names, trimmed, no empties or repeats. */
export function parseNames(text: string): string[] {
  return [...new Set(text.split(/[,;]/).map((s) => s.trim()).filter(Boolean))]
}

/** Hours typed in a cell: «2», «1,5», «» (none); null when it is not a number ≥ 0. */
export function parseHours(text: string): number | null | 'invalid' {
  const s = text.trim().replace(',', '.')
  if (s === '') return null
  if (!/^\d+(\.\d+)?$/.test(s)) return 'invalid'
  return Math.round(Number(s) * 100) / 100
}

export type BulkItem = { id: string; sphere: string; status: string | null; done_at: string | null; priority?: string | null; area?: string | null; due_date?: string | null; week_id?: string | null }
export type BulkAction =
  | { kind: 'status'; status: string }
  | { kind: 'priority'; priority: string | null }
  | { kind: 'area'; area: string | null }
  | { kind: 'due'; due: ISODate | null }
  | { kind: 'week'; weekId: string }
  | { kind: 'done' }
  | { kind: 'takeOff' }

type Patch = Record<string, unknown>
const DONE_STATUS: Partial<Record<string, string>> = { work: 'Erledigt', study: 'готово', body: 'Готово' }

/**
 * Patches of a bulk action and the patches that undo it (one «Отменить» for the whole batch). Statuses as in the
 * app: Work — Erledigt sets done_at, any other status clears it; «готово» — the sphere's done status; «снять» — the
 * sphere's cancel status. Items already in the target state are left out.
 */
export function bulkPatches(items: readonly BulkItem[], action: BulkAction, nowIso: string): { apply: { id: string; patch: Patch }[]; undo: { id: string; patch: Patch }[] } {
  const apply: { id: string; patch: Patch }[] = []
  const undo: { id: string; patch: Patch }[] = []
  for (const i of items) {
    let patch: Patch | null = null
    let back: Patch = {}
    switch (action.kind) {
      case 'status':
        if (i.status === action.status) break
        patch = { status: action.status, done_at: action.status === DONE_STATUS[i.sphere] ? (i.done_at ?? nowIso) : null }
        back = { status: i.status, done_at: i.done_at }
        break
      case 'priority':
        if ((i.priority ?? null) === action.priority) break
        patch = { priority: action.priority }
        back = { priority: i.priority ?? null }
        break
      case 'area':
        if ((i.area ?? null) === action.area) break
        patch = { area: action.area }
        back = { area: i.area ?? null }
        break
      case 'due':
        if ((i.due_date ?? null) === action.due) break
        patch = { due_date: action.due }
        back = { due_date: i.due_date ?? null }
        break
      case 'week':
        if ((i.week_id ?? null) === action.weekId) break
        patch = { week_id: action.weekId }
        back = { week_id: i.week_id ?? null }
        break
      case 'done': {
        if (i.done_at !== null && (DONE_STATUS[i.sphere] === undefined || i.status === DONE_STATUS[i.sphere])) break
        const status = DONE_STATUS[i.sphere]
        patch = status ? { status, done_at: nowIso } : { done_at: nowIso }
        back = status ? { status: i.status, done_at: i.done_at } : { done_at: i.done_at }
        break
      }
      case 'takeOff': {
        const cancel = CANCEL_STATUS[(i.sphere in CANCEL_STATUS ? i.sphere : 'personal') as Sphere]
        if (i.status === cancel) break
        patch = { status: cancel, done_at: null }
        back = { status: i.status, done_at: i.done_at }
        break
      }
    }
    if (patch) {
      apply.push({ id: i.id, patch })
      undo.push({ id: i.id, patch: back })
    }
  }
  return { apply, undo }
}
