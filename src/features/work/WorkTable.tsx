import { useMemo, useState } from 'react'
import { DataTable, type Column, type GroupBy } from '@/components/table/DataTable'
import { BulkButton, BulkDate, BulkSelect } from '@/components/table/BulkControls'
import { Chip } from '@/components/ui/Chip'
import { MetaChip } from '@/components/ui/MetaChip'
import { SkeletonCard } from '@/components/ui/Feedback'
import { ERFOLG_TYPE, WORK_AREAS, WORK_PRIORITIES, WORK_STATUSES, WORK_TYPES } from '@/lib/constants'
import { formatWeekdayDate, todayBerlin } from '@/lib/dates'
import { deadlineChip, isItemOpen } from '@/lib/rules/items'
import { parseNames } from '@/lib/rules/table'
import { statusAltDays } from '@/lib/rules/work'
import { useItems, useUpdateItem, type Item } from '@/features/items/api'
import { useBulkItems } from '@/features/items/useBulkItems'
import { statusPatch } from './statusPatch'

const PRIO_RANK: Record<string, number> = { Hoch: 1, Mittel: 2, Niedrig: 3 }
const opt = (values: readonly string[], none = true) => [...(none ? [{ value: '', label: '—' }] : []), ...values.map((v) => ({ value: v, label: v }))]
const text = (field: 'title' | 'next_step' | 'waiting_on', required = false) => ({
  kind: 'text' as const,
  get: (i: Item) => i[field] ?? '',
  set: (_: Item, v: string) => (required && !v.trim() ? ('invalid' as const) : { [field]: v.trim() || null }),
})

/**
 * Работа · Таблица (laptop): every task except Erfolge — Titel, Typ, Bereich, Status, Prio, Fällig, Nächster Schritt,
 * Wartet auf, Beteiligte; edited in place through the same item mutations as the board (Status alt follows updated_at).
 */
export function WorkTable() {
  const today = todayBerlin()
  const items = useItems()
  const update = useUpdateItem()
  const bulk = useBulkItems()
  const [showClosed, setShowClosed] = useState(false)
  const [areas, setAreas] = useState<string[]>([])

  const tasks = useMemo(() => (items.data ?? []).filter((i) => i.sphere === 'work' && i.type !== ERFOLG_TYPE), [items.data])
  const knownAreas = useMemo(() => [...new Set([...WORK_AREAS, ...tasks.map((i) => i.area).filter((a): a is string => Boolean(a))])].sort((a, b) => a.localeCompare(b, 'de')), [tasks])
  const usedAreas = useMemo(() => [...new Set(tasks.map((i) => i.area).filter((a): a is string => Boolean(a)))].sort((a, b) => a.localeCompare(b, 'de')), [tasks])

  const columns = useMemo<Column<Item>[]>(
    () => [
      { id: 'title', header: 'Titel', lang: 'de', width: 300, fixed: true, value: (i) => i.title, editor: text('title', true) },
      { id: 'type', header: 'Typ', lang: 'de', width: 112, value: (i) => i.type, editor: { kind: 'select', get: (i) => i.type ?? '', options: () => opt(WORK_TYPES), set: (_, v) => ({ type: v || null }) } },
      { id: 'area', header: 'Bereich', lang: 'de', width: 168, value: (i) => i.area, editor: { kind: 'text', get: (i) => i.area ?? '', set: (_, v) => ({ area: v.trim() || null }), list: knownAreas } },
      {
        id: 'status',
        header: 'Status',
        lang: 'de',
        width: 176,
        value: (i) => WORK_STATUSES.indexOf((i.status ?? 'Offen') as (typeof WORK_STATUSES)[number]),
        search: (i) => i.status ?? 'Offen',
        render: (i) => {
          const alt = statusAltDays(i, today)
          return (
            <span className="flex items-center gap-2">
              <span lang="de">{i.status ?? 'Offen'}</span>
              {alt !== null && <MetaChip kind="alt" text={`alt · ${alt} дн`} />}
            </span>
          )
        },
        editor: { kind: 'select', get: (i) => i.status ?? 'Offen', options: () => opt(WORK_STATUSES, false), set: (_, v) => statusPatch(v) },
      },
      { id: 'priority', header: 'Prio', lang: 'de', width: 88, value: (i) => (i.priority ? (PRIO_RANK[i.priority] ?? 9) : null), search: (i) => i.priority, render: (i) => i.priority ?? '', editor: { kind: 'select', get: (i) => i.priority ?? '', options: () => opt(WORK_PRIORITIES), set: (_, v) => ({ priority: v || null }) } },
      {
        id: 'due',
        header: 'Fällig',
        lang: 'de',
        width: 176,
        value: (i) => i.due_date,
        render: (i) => {
          if (!i.due_date) return ''
          const chip = isItemOpen(i) ? deadlineChip(i, today) : null
          return chip && (chip.kind === 'late' || chip.kind === 'hot') ? <MetaChip {...chip} /> : formatWeekdayDate(i.due_date)
        },
        editor: { kind: 'date', get: (i) => i.due_date ?? '', set: (_, v) => ({ due_date: v || null }) },
      },
      { id: 'next', header: 'Nächster Schritt', lang: 'de', width: 240, value: (i) => i.next_step, editor: text('next_step') },
      { id: 'waiting', header: 'Wartet auf', lang: 'de', width: 140, value: (i) => i.waiting_on, editor: text('waiting_on') },
      {
        id: 'people',
        header: 'Beteiligte',
        lang: 'de',
        width: 180,
        value: (i) => i.people.join(', '),
        editor: { kind: 'text', get: (i) => i.people.join(', '), set: (_, v) => ({ people: parseNames(v) }) },
      },
    ],
    [knownAreas, today],
  )
  const groupings = useMemo<GroupBy<Item>[]>(
    () => [
      { id: 'status', label: 'по статусу', key: (i) => i.status ?? 'Offen', order: WORK_STATUSES, emptyLabel: 'Без статуса' },
      { id: 'area', label: 'по Bereich', key: (i) => i.area, emptyLabel: 'Без Bereich' },
    ],
    [],
  )

  if (items.isPending) return <SkeletonCard />
  const shown = tasks.filter((i) => (showClosed || isItemOpen(i)) && (areas.length === 0 || areas.includes(i.area ?? '')))

  return (
    <DataTable
      label="Задачи Работы"
      rows={shown}
      columns={columns}
      getId={(i) => i.id}
      onPatch={(i, patch) => update.mutate({ id: i.id, patch })}
      groupings={groupings}
      storageKey="lifehub.table.work"
      empty="Под эти фильтры ничего не подходит."
      toolbar={
        <>
          <Chip selected={showClosed} onClick={() => setShowClosed(!showClosed)} className="h-9 text-cap">
            Закрытые
          </Chip>
          {usedAreas.map((a) => (
            <Chip key={a} lang="de" selected={areas.includes(a)} onClick={() => setAreas(areas.includes(a) ? areas.filter((x) => x !== a) : [...areas, a])} className="h-9 text-cap">
              {a}
            </Chip>
          ))}
        </>
      }
      bulk={(sel, clear) => (
        <>
          <BulkSelect label="Статус" lang="de" options={opt(WORK_STATUSES, false)} onPick={(v) => bulk(sel, { kind: 'status', status: v }, clear)} />
          <BulkSelect label="Prio" lang="de" options={[...opt(WORK_PRIORITIES, false), { value: '-', label: 'без Prio' }]} onPick={(v) => bulk(sel, { kind: 'priority', priority: v === '-' ? null : v })} />
          <BulkSelect label="Bereich" lang="de" options={[...knownAreas.map((a) => ({ value: a, label: a })), { value: '-', label: 'без Bereich' }]} onPick={(v) => bulk(sel, { kind: 'area', area: v === '-' ? null : v })} />
          <BulkDate label="Срок" onPick={(v) => bulk(sel, { kind: 'due', due: v })} />
          <BulkButton onClick={() => bulk(sel, { kind: 'done' }, clear)}>Erledigt</BulkButton>
          <BulkButton onClick={() => bulk(sel, { kind: 'takeOff' }, clear)}>Verworfen</BulkButton>
        </>
      )}
    />
  )
}
