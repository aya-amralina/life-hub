import type { Sphere } from '@/lib/constants'
import type { TablesInsert } from '@/lib/db/types'
import type { ISODate } from '@/lib/dates'
import { readyBy } from '@/lib/rules/study'

/** Sphere defaults for a new item: work starts as Offen/Aufgabe, study gets «готово к» (rule 6). */
export function newItem(sphere: Sphere, title: string, due: string | null): TablesInsert<'items'> {
  const base: TablesInsert<'items'> = { sphere, title, due_date: due }
  if (sphere === 'work') return { ...base, status: 'Offen', type: 'Aufgabe' }
  if (sphere === 'study') return { ...base, status: 'открыто', ready_by: due ? readyBy(due) : null }
  if (sphere === 'body') return { ...base, status: 'Не начато' }
  return base
}

const clean = (s: string | null | undefined) => (s?.trim() ? s.trim() : null)

/** «+» on Работа: a task with Typ, Bereich, Prio and Fällig; the rest of the card is filled later. */
export function newWorkTask(f: {
  title: string
  type?: string | null
  area?: string | null
  priority?: string | null
  due?: ISODate | null
  nextStep?: string | null
  waitingOn?: string | null
}): TablesInsert<'items'> {
  return {
    ...newItem('work', f.title.trim(), f.due ?? null),
    type: f.type ?? 'Aufgabe',
    area: f.area ?? null,
    priority: f.priority ?? null,
    next_step: clean(f.nextStep),
    waiting_on: clean(f.waitingOn),
  }
}

/** «+» on Учёба: subject, type, hours and the week it is planned in; a deadline gives «готово к» (rule 6). */
export function newStudyItem(f: {
  title: string
  area?: string | null
  type?: string | null
  hours?: number | null
  weekId: string | null
  due?: ISODate | null
}): TablesInsert<'items'> {
  return {
    ...newItem('study', f.title.trim(), f.due ?? null),
    area: f.area ?? null,
    type: f.type ?? null,
    hours_est: f.hours ? f.hours : null,
    week_id: f.weekId,
  }
}

/** «+» on Тело: a task to do by a date, or a visit on a day (optionally at a time). */
export function newBodyItem(f: { title: string; kind: 'task' | 'visit'; date: ISODate | null; time?: string | null }): TablesInsert<'items'> {
  if (f.kind === 'visit' && f.date) {
    return { ...newItem('body', f.title.trim(), null), happens_on: f.date, happens_time: f.time ?? null }
  }
  return newItem('body', f.title.trim(), f.date)
}
