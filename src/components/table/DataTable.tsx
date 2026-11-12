import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Columns3, Search, X } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { clampWidth, groupRows, matchesSearch, moveCell, nextSort, parsePrefs, selectClick, sortRows, type Cell, type ColumnPrefs, type Pos, type Sort } from '@/lib/rules/table'

export type Patch = Record<string, unknown>

/** How a cell is edited. `set` returns the patch, or 'invalid' to keep the editor open. */
export type Editor<T> =
  | { kind: 'text'; get: (row: T) => string; set: (row: T, value: string) => Patch | 'invalid'; list?: readonly string[] }
  | { kind: 'date'; get: (row: T) => string; set: (row: T, value: string) => Patch | 'invalid' }
  | { kind: 'select'; get: (row: T) => string; options: (row: T) => readonly { value: string; label: string }[]; set: (row: T, value: string) => Patch | 'invalid' }
  | { kind: 'check'; get: (row: T) => boolean; toggle: (row: T) => Patch }

export type Column<T> = {
  id: string
  header: string
  lang?: 'de'
  width: number
  align?: 'right' | 'center'
  /** sort value (and the search text unless `search` is given) */
  value: (row: T) => Cell
  render?: (row: T) => ReactNode
  search?: (row: T) => string | null
  editor?: Editor<T>
  /** cannot be hidden (the name of the row) */
  fixed?: boolean
}

export type GroupBy<T> = { id: string; label: string; key: (row: T) => string | null; order?: readonly string[]; groupLabel?: (key: string) => string; emptyLabel: string }

const loadPrefs = (key: string, known: readonly string[]): ColumnPrefs => {
  try {
    return parsePrefs(localStorage.getItem(key), known)
  } catch {
    return { hidden: [], widths: {} }
  }
}
const savePrefs = (key: string, prefs: ColumnPrefs) => {
  try {
    localStorage.setItem(key, JSON.stringify(prefs))
  } catch {
    // private mode: the settings live until reload
  }
}

/**
 * Dense table for the laptop (DESIGN «Таблица»): sort by a header click, search, grouping, columns to show and their
 * widths (kept on the device), editing in the cell (click / Enter — edit, Enter — save, Esc — cancel, arrows and Tab —
 * move), row selection (checkbox, Shift-click for a range) with a bar of bulk actions. Data and saving stay outside:
 * `onPatch` goes through the app's mutations.
 */
export function DataTable<T>({
  label,
  rows,
  columns,
  getId,
  onPatch,
  groupings,
  storageKey,
  toolbar,
  bulk,
  empty,
}: {
  label: string
  rows: readonly T[]
  columns: readonly Column<T>[]
  getId: (row: T) => string
  onPatch: (row: T, patch: Patch) => void
  groupings: readonly GroupBy<T>[]
  storageKey: string
  /** chips of the screen (filters), shown before the search */
  toolbar?: ReactNode
  bulk: (selected: T[], clear: () => void) => ReactNode
  empty: string
}) {
  const ids = useMemo(() => columns.map((c) => c.id), [columns])
  const [prefs, setPrefs] = useState<ColumnPrefs>(() => loadPrefs(storageKey, ids))
  const [sort, setSort] = useState<Sort>(null)
  const [query, setQuery] = useState('')
  const [groupId, setGroupId] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [active, setActive] = useState<Pos | null>(null)
  const [editing, setEditing] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const updatePrefs = (p: ColumnPrefs) => {
    setPrefs(p)
    savePrefs(storageKey, p)
  }
  const visible = columns.filter((c) => !prefs.hidden.includes(c.id))
  const width = (c: Column<T>) => prefs.widths[c.id] ?? c.width

  const found = rows.filter((r) => matchesSearch(columns.map((c) => (c.search ? c.search(r) : String(c.value(r) ?? ''))), query))
  const sorted = sortRows(found, sort, (r, col) => columns.find((c) => c.id === col)?.value(r))
  const grouping = groupings.find((g) => g.id === groupId) ?? null
  const groups = grouping ? groupRows(sorted, grouping.key, { order: grouping.order, label: grouping.groupLabel, emptyLabel: grouping.emptyLabel }) : [{ key: '', label: '', rows: sorted }]
  const flat = groups.flatMap((g) => g.rows)
  const order = flat.map(getId)
  const chosen = flat.filter((r) => selected.has(getId(r)))
  // selection outlives filters only for rows still shown
  const clear = () => setSelected(new Set())

  // focus follows the active cell while the grid has focus
  useEffect(() => {
    if (!active || editing) return
    const grid = gridRef.current
    if (!grid || !grid.contains(document.activeElement)) return
    grid.querySelector<HTMLElement>(`[data-cell="${active.row}:${active.col}"]`)?.focus()
  }, [active, editing])

  const commit = (row: T, col: Column<T>, value: string) => {
    const ed = col.editor
    if (!ed || ed.kind === 'check') return true
    if (value === ed.get(row)) return true
    const patch = ed.set(row, value)
    if (patch === 'invalid') return false
    onPatch(row, patch)
    return true
  }

  const onGridKey = (e: KeyboardEvent<HTMLTableElement>) => {
    if (editing || !active) return
    const key = e.key === 'Tab' ? (e.shiftKey ? 'ShiftTab' : 'Tab') : e.key
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab', 'ShiftTab'].includes(key)) {
      const next = moveCell(active, key as Parameters<typeof moveCell>[1], flat.length, visible.length)
      // Tab on the last cell leaves the grid as usual
      if ((key === 'Tab' || key === 'ShiftTab') && next.row === active.row && next.col === active.col) return
      e.preventDefault()
      setActive(next)
      return
    }
    const row = flat[active.row]
    const col = visible[active.col]
    if (!row || !col?.editor) return
    if (col.editor.kind === 'check' && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault()
      onPatch(row, col.editor.toggle(row))
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      setEditing(true)
    }
  }

  const startResize = (e: PointerEvent<HTMLSpanElement>, col: Column<T>) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const start = width(col)
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    let latest = start
    const move = (ev: globalThis.PointerEvent) => {
      latest = clampWidth(start + ev.clientX - startX)
      setPrefs((p) => ({ ...p, widths: { ...p.widths, [col.id]: latest } }))
    }
    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      setPrefs((p) => {
        const next = { ...p, widths: { ...p.widths, [col.id]: latest } }
        savePrefs(storageKey, next)
        return next
      })
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }

  const rowOf = new Map(order.map((id, i) => [id, i]))
  const allShown = order.length > 0 && order.every((id) => selected.has(id))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {toolbar}
        <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-xl border border-line2 bg-card px-3 focus-within:border-ink2">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" className="text-ink3" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск" aria-label="Поиск по таблице" className="min-w-0 flex-1 bg-transparent text-cap text-ink outline-none placeholder:text-ink3" />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск" className="flex size-6 items-center justify-center rounded-md text-ink3 hover:bg-sub">
              <X size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </label>
        <label className="flex h-9 items-center gap-2 rounded-xl border border-line2 bg-card px-3 text-cap text-ink2">
          Группировать
          <select aria-label="Группировать" value={groupId} onChange={(e) => setGroupId(e.target.value)} className="bg-transparent text-cap font-semibold text-ink outline-none">
            <option value="">нет</option>
            {groupings.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <details className="relative">
          <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-xl border border-line2 bg-card px-3 text-cap text-ink [&::-webkit-details-marker]:hidden">
            <Columns3 size={16} strokeWidth={1.75} aria-hidden="true" />
            Колонки
          </summary>
          <div className="absolute right-0 z-20 mt-1 flex w-60 flex-col gap-0.5 rounded-xl border border-line bg-card p-2 shadow-sheet">
            {columns.map((c) => (
              <label key={c.id} className={cn('flex h-8 items-center gap-2 rounded-md px-2 text-cap', c.fixed ? 'text-ink3' : 'text-ink hover:bg-sub')}>
                <input
                  type="checkbox"
                  disabled={c.fixed}
                  checked={!prefs.hidden.includes(c.id)}
                  onChange={(e) => updatePrefs({ ...prefs, hidden: e.target.checked ? prefs.hidden.filter((h) => h !== c.id) : [...prefs.hidden, c.id] })}
                  className="accent-[var(--ink)]"
                />
                <span lang={c.lang}>{c.header}</span>
              </label>
            ))}
            <button type="button" onClick={() => updatePrefs({ hidden: [], widths: {} })} className="mt-1 h-8 rounded-md px-2 text-left text-cap text-ink2 hover:bg-sub">
              Сбросить ширину и колонки
            </button>
          </div>
        </details>
      </div>

      {chosen.length > 0 && (
        <div role="toolbar" aria-label="Действия с выбранными" className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl bg-inv px-3 py-2 text-cap text-on-inv">
          <span className="font-semibold tabular-nums">Выбрано: {chosen.length}</span>
          {bulk(chosen, clear)}
          <button type="button" onClick={clear} className="ml-auto h-8 rounded-lg px-3 text-cap text-on-inv hover:bg-inv2">
            Снять выбор
          </button>
        </div>
      )}

      <div ref={gridRef} className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table role="grid" aria-label={label} aria-rowcount={flat.length + 1} onKeyDown={onGridKey} className="w-max min-w-full table-fixed border-collapse text-cap">
          <colgroup>
            <col style={{ width: 36 }} />
            {visible.map((c) => (
              <col key={c.id} style={{ width: width(c) }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-[1] bg-card">
            <tr role="row" className="border-b border-line2">
              <th role="columnheader" className="h-9 px-2">
                <input
                  type="checkbox"
                  aria-label="Выбрать все строки"
                  checked={allShown}
                  onChange={() => setSelected(allShown ? new Set() : new Set(order))}
                  className="size-4 accent-[var(--ink)]"
                />
              </th>
              {visible.map((c) => (
                <th
                  key={c.id}
                  role="columnheader"
                  aria-sort={sort?.col === c.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={cn('relative h-9 px-0 text-left font-semibold text-ink2', c.align === 'right' && 'text-right')}
                >
                  <button type="button" onClick={() => setSort(nextSort(sort, c.id))} className={cn('flex h-9 w-full items-center gap-1 px-2 hover:text-ink', c.align === 'right' && 'justify-end')}>
                    <span lang={c.lang} className="truncate">
                      {c.header}
                    </span>
                    {sort?.col === c.id && (sort.dir === 'asc' ? <ArrowUp size={12} strokeWidth={2} aria-hidden="true" /> : <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />)}
                  </button>
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Ширина колонки ${c.header}`}
                    onPointerDown={(e) => startResize(e, c)}
                    className="absolute top-1.5 right-0 bottom-1.5 w-1.5 cursor-col-resize rounded-sm hover:bg-line2"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flat.length === 0 && (
              <tr>
                <td colSpan={visible.length + 1} className="h-16 px-4 text-center text-ink2">
                  {empty}
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <GroupRows key={g.key || '_'} title={grouping ? g.label : null} count={g.rows.length} span={visible.length + 1}>
                {g.rows.map((row) => {
                  const id = getId(row)
                  const r = rowOf.get(id)!
                  const isSel = selected.has(id)
                  return (
                    <tr key={id} role="row" aria-selected={isSel} className={cn('border-b border-line last:border-b-0', isSel ? 'bg-sub' : 'hover:bg-sub/60')}>
                      <td className="h-9 px-2">
                        <input
                          type="checkbox"
                          aria-label="Выбрать строку"
                          checked={isSel}
                          onChange={() => {}}
                          onClick={(e) => {
                            const s = selectClick(order, selected, anchor, id, e.shiftKey)
                            setSelected(s.selected)
                            setAnchor(s.anchor)
                          }}
                          className="size-4 accent-[var(--ink)]"
                        />
                      </td>
                      {visible.map((c, ci) => (
                        <DataCell
                          key={c.id}
                          row={row}
                          col={c}
                          pos={{ row: r, col: ci }}
                          active={active?.row === r && active.col === ci}
                          editing={editing && active?.row === r && active.col === ci}
                          onActivate={(edit) => {
                            setActive({ row: r, col: ci })
                            if (c.editor?.kind === 'check') onPatch(row, c.editor.toggle(row))
                            else setEditing(edit && Boolean(c.editor))
                          }}
                          onCommit={(value, move) => {
                            if (!commit(row, c, value)) return false
                            setEditing(false)
                            if (move) setActive(moveCell({ row: r, col: ci }, move, flat.length, visible.length))
                            requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${ci}"]`)?.focus())
                            return true
                          }}
                          onCancel={() => {
                            setEditing(false)
                            requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${ci}"]`)?.focus())
                          }}
                        />
                      ))}
                    </tr>
                  )
                })}
              </GroupRows>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-cap text-ink2 tabular-nums">
        {flat.length} из {rows.length} · клик по ячейке — правка, Enter — сохранить, Esc — отмена, стрелки и Tab — по ячейкам, Shift-клик — выбрать диапазон
      </p>
    </div>
  )
}

function GroupRows({ title, count, span, children }: { title: string | null; count: number; span: number; children: ReactNode }) {
  return (
    <>
      {title !== null && (
        <tr role="row" className="border-b border-line bg-bg">
          <th colSpan={span} scope="colgroup" className="h-8 px-3 text-left text-cap font-semibold text-ink">
            {title} <span className="font-normal text-ink2 tabular-nums">· {count}</span>
          </th>
        </tr>
      )}
      {children}
    </>
  )
}

function DataCell<T>({
  row,
  col,
  pos,
  active,
  editing,
  onActivate,
  onCommit,
  onCancel,
}: {
  row: T
  col: Column<T>
  pos: Pos
  active: boolean
  editing: boolean
  onActivate: (edit: boolean) => void
  onCommit: (value: string, move?: 'Tab' | 'ShiftTab' | 'ArrowDown') => boolean
  onCancel: () => void
}) {
  const ed = col.editor
  const shown = col.render ? col.render(row) : (col.value(row) ?? '')
  return (
    <td
      role="gridcell"
      data-cell={`${pos.row}:${pos.col}`}
      tabIndex={active ? 0 : -1}
      aria-readonly={!ed}
      onClick={() => !editing && onActivate(true)}
      onFocus={() => !active && onActivate(false)}
      className={cn(
        'h-9 overflow-hidden px-2 align-middle whitespace-nowrap text-ink outline-none',
        col.align === 'right' && 'text-right tabular-nums',
        col.align === 'center' && 'text-center',
        ed && ed.kind !== 'check' && 'cursor-text',
        active && 'shadow-[inset_0_0_0_2px_var(--ink)]',
      )}
    >
      {editing && ed && ed.kind !== 'check' ? (
        <CellEditor row={row} editor={ed} lang={col.lang} onCommit={onCommit} onCancel={onCancel} />
      ) : ed?.kind === 'check' ? (
        <span aria-label={ed.get(row) ? 'готово' : 'не готово'} className={cn('inline-flex size-4 items-center justify-center rounded border-[1.5px]', ed.get(row) ? 'border-inv bg-inv text-on-inv' : 'border-line2')}>
          {ed.get(row) && '✓'}
        </span>
      ) : (
        <span lang={col.lang} className="block truncate">
          {shown}
        </span>
      )}
    </td>
  )
}

function CellEditor<T>({
  row,
  editor,
  lang,
  onCommit,
  onCancel,
}: {
  row: T
  editor: Exclude<Editor<T>, { kind: 'check' }>
  lang?: string
  onCommit: (value: string, move?: 'Tab' | 'ShiftTab' | 'ArrowDown') => boolean
  onCancel: () => void
}) {
  const [value, setValue] = useState(editor.get(row))
  const [bad, setBad] = useState(false)
  const done = useRef(false)
  const listId = useId()
  const finish = (v: string, move?: 'Tab' | 'ShiftTab' | 'ArrowDown') => {
    if (done.current) return
    if (onCommit(v, move)) done.current = true
    else setBad(true)
  }
  const keys = (e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      finish(value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      done.current = true
      onCancel()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      finish(value, e.shiftKey ? 'ShiftTab' : 'Tab')
    }
  }
  const cls = cn('h-7 w-full rounded-md border bg-card px-1.5 text-cap text-ink outline-none', bad ? 'border-red' : 'border-ink2')
  if (editor.kind === 'select') {
    return (
      <select
        autoFocus
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          finish(e.target.value)
        }}
        onKeyDown={keys}
        onBlur={() => finish(value)}
        aria-label="Значение"
        lang={lang}
        className={cls}
      >
        {editor.options(row).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }
  return (
    <>
      <input
        autoFocus
        type={editor.kind === 'date' ? 'date' : 'text'}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setBad(false)
        }}
        onKeyDown={keys}
        onBlur={() => finish(value)}
        aria-label="Значение"
        aria-invalid={bad}
        lang={lang}
        list={editor.kind === 'text' && editor.list ? listId : undefined}
        className={cls}
      />
      {editor.kind === 'text' && editor.list && (
        <datalist id={listId}>
          {editor.list.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </>
  )
}
