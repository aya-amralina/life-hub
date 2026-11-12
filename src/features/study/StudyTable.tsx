import { useMemo, useState } from 'react'
import { DataTable, type Column, type GroupBy } from '@/components/table/DataTable'
import { BulkButton, BulkDate, BulkSelect } from '@/components/table/BulkControls'
import { Chip } from '@/components/ui/Chip'
import { MetaChip } from '@/components/ui/MetaChip'
import { SkeletonCard } from '@/components/ui/Feedback'
import { STUDY_TYPES } from '@/lib/constants'
import { formatWeekdayDate, todayBerlin, weekStart } from '@/lib/dates'
import { formatHours } from '@/lib/format'
import { deadlineChip, isItemDone, isItemOpen } from '@/lib/rules/items'
import { isFixed, itemWeekStart } from '@/lib/rules/study'
import { parseHours } from '@/lib/rules/table'
import { useItems, useUpdateItem, type Item } from '@/features/items/api'
import { donePatch, reopenPatch } from '@/features/items/donePatch'
import { useBulkItems } from '@/features/items/useBulkItems'
import { useAllWeeks } from '@/features/weeks/api'
import { weekLabel } from './weekLabel'

const opt = (values: readonly string[]) => [{ value: '', label: '—' }, ...values.map((v) => ({ value: v, label: v }))]

/**
 * Учёба · Таблица (laptop): неделя, предмет, тип, что закрыть, часы, срок, «готово к», гибкий / жёсткий, ✓ —
 * edited in place through the same item mutations as the week list. «Гибкий / жёсткий» stores only a choice
 * that differs from rule 19 (a deadline makes an item fixed), as the item card does.
 */
export function StudyTable() {
  const today = todayBerlin()
  const items = useItems()
  const weeks = useAllWeeks()
  const update = useUpdateItem()
  const bulk = useBulkItems()
  const [showClosed, setShowClosed] = useState(false)
  const [fromThisWeek, setFromThisWeek] = useState(true)
  const [subjects, setSubjects] = useState<string[]>([])

  const weekList = useMemo(() => weeks.data ?? [], [weeks.data])
  const study = useMemo(() => (items.data ?? []).filter((i) => i.sphere === 'study'), [items.data])
  const known = useMemo(() => [...new Set(study.map((i) => i.area).filter((a): a is string => Boolean(a)))].sort((a, b) => a.localeCompare(b, 'de')), [study])
  const weekOptions = useMemo(() => [{ value: '', label: '—' }, ...[...weekList].sort((a, b) => a.start_date.localeCompare(b.start_date)).map((w) => ({ value: w.id, label: weekLabel(w.start_date, weekList, true) }))], [weekList])

  const columns = useMemo<Column<Item>[]>(
    () => [
      {
        id: 'week',
        header: 'Неделя',
        width: 168,
        value: (i) => itemWeekStart(i, weekList),
        render: (i) => {
          const m = itemWeekStart(i, weekList)
          return m ? weekLabel(m, weekList, true) : ''
        },
        editor: { kind: 'select', get: (i) => i.week_id ?? '', options: () => weekOptions, set: (_, v) => ({ week_id: v || null }) },
      },
      { id: 'area', header: 'Предмет', lang: 'de', width: 160, value: (i) => i.area, editor: { kind: 'text', get: (i) => i.area ?? '', set: (_, v) => ({ area: v.trim() || null }), list: known } },
      { id: 'type', header: 'Тип', width: 120, value: (i) => i.type, editor: { kind: 'select', get: (i) => i.type ?? '', options: () => opt(STUDY_TYPES), set: (_, v) => ({ type: v || null }) } },
      { id: 'title', header: 'Что закрыть', lang: 'de', width: 320, fixed: true, value: (i) => i.title, editor: { kind: 'text', get: (i) => i.title, set: (_, v) => (v.trim() ? { title: v.trim() } : 'invalid') } },
      {
        id: 'hours',
        header: 'Часы',
        width: 72,
        align: 'right',
        value: (i) => (i.hours_est === null ? null : Number(i.hours_est)),
        render: (i) => (i.hours_est ? formatHours(Number(i.hours_est)) : ''),
        editor: {
          kind: 'text',
          get: (i) => (i.hours_est === null ? '' : String(Number(i.hours_est)).replace('.', ',')),
          set: (_, v) => {
            const h = parseHours(v)
            return h === 'invalid' ? 'invalid' : { hours_est: h }
          },
        },
      },
      {
        id: 'due',
        header: 'Срок',
        width: 168,
        value: (i) => i.due_date,
        render: (i) => {
          if (!i.due_date) return ''
          const chip = isItemOpen(i) ? deadlineChip(i, today) : null
          return chip && (chip.kind === 'late' || chip.kind === 'hot') ? <MetaChip {...chip} /> : formatWeekdayDate(i.due_date)
        },
        editor: { kind: 'date', get: (i) => i.due_date ?? '', set: (_, v) => ({ due_date: v || null }) },
      },
      { id: 'ready', header: 'Готово к', width: 112, value: (i) => i.ready_by, render: (i) => (i.ready_by ? formatWeekdayDate(i.ready_by) : ''), editor: { kind: 'date', get: (i) => i.ready_by ?? '', set: (_, v) => ({ ready_by: v || null }) } },
      {
        id: 'fixed',
        header: 'Гибкий / жёсткий',
        width: 136,
        value: (i) => (isFixed(i) ? 'жёсткий' : 'гибкий'),
        editor: {
          kind: 'select',
          get: (i) => (isFixed(i) ? 'fixed' : 'flex'),
          options: () => [
            { value: 'flex', label: 'гибкий' },
            { value: 'fixed', label: 'жёсткий' },
          ],
          // only a choice different from the rule is stored
          set: (i, v) => ({ is_fixed: (v === 'fixed') === (i.due_date !== null) ? null : v === 'fixed' }),
        },
      },
      {
        id: 'done',
        header: '✓',
        width: 56,
        align: 'center',
        value: (i) => isItemDone(i),
        search: () => null,
        editor: { kind: 'check', get: (i) => isItemDone(i), toggle: (i) => (isItemDone(i) ? reopenPatch(null, 'study') : donePatch('study')) },
      },
    ],
    [known, today, weekList, weekOptions],
  )
  const groupings = useMemo<GroupBy<Item>[]>(
    () => [
      { id: 'week', label: 'по неделе', key: (i) => itemWeekStart(i, weekList), groupLabel: (m) => weekLabel(m, weekList, true), emptyLabel: 'Без недели' },
      { id: 'subject', label: 'по предмету', key: (i) => i.area, emptyLabel: 'Без предмета' },
    ],
    [weekList],
  )

  if (items.isPending || weeks.isPending) return <SkeletonCard />
  const monday = weekStart(today)
  const shown = study.filter((i) => {
    if (!showClosed && !isItemOpen(i)) return false
    if (subjects.length && !subjects.includes(i.area ?? '')) return false
    if (fromThisWeek) {
      const m = itemWeekStart(i, weekList)
      if (m !== null && m < monday) return false
    }
    return true
  })

  return (
    <DataTable
      label="Пункты Учёбы"
      rows={shown}
      columns={columns}
      getId={(i) => i.id}
      onPatch={(i, patch) => update.mutate({ id: i.id, patch })}
      groupings={groupings}
      storageKey="lifehub.table.study"
      empty="Под эти фильтры ничего не подходит."
      toolbar={
        <>
          <Chip selected={fromThisWeek} onClick={() => setFromThisWeek(!fromThisWeek)} className="h-9 text-cap">
            С этой недели
          </Chip>
          <Chip selected={showClosed} onClick={() => setShowClosed(!showClosed)} className="h-9 text-cap">
            Закрытые
          </Chip>
          {known.map((a) => (
            <Chip key={a} lang="de" selected={subjects.includes(a)} onClick={() => setSubjects(subjects.includes(a) ? subjects.filter((x) => x !== a) : [...subjects, a])} className="h-9 text-cap">
              {a}
            </Chip>
          ))}
        </>
      }
      bulk={(sel, clear) => (
        <>
          <BulkSelect label="Перенести на неделю" options={weekOptions.filter((o) => o.value !== '')} onPick={(v) => bulk(sel, { kind: 'week', weekId: v }, clear)} />
          <BulkDate label="Срок" onPick={(v) => bulk(sel, { kind: 'due', due: v })} />
          <BulkButton onClick={() => bulk(sel, { kind: 'done' }, clear)}>Готово</BulkButton>
          <BulkButton onClick={() => bulk(sel, { kind: 'takeOff' }, clear)}>Снять</BulkButton>
        </>
      )}
    />
  )
}
