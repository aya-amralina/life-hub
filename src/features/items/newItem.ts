import type { Sphere } from '@/lib/constants'
import type { TablesInsert } from '@/lib/db/types'
import { readyBy } from '@/lib/rules/study'

/** Sphere defaults for a new item: work starts as Offen/Aufgabe, study gets «готово к» (rule 6). */
export function newItem(sphere: Sphere, title: string, due: string | null): TablesInsert<'items'> {
  const base: TablesInsert<'items'> = { sphere, title, due_date: due }
  if (sphere === 'work') return { ...base, status: 'Offen', type: 'Aufgabe' }
  if (sphere === 'study') return { ...base, status: 'открыто', ready_by: due ? readyBy(due) : null }
  if (sphere === 'body') return { ...base, status: 'Не начато' }
  return base
}
