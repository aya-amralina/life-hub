import type { Sphere } from '@/lib/constants'
import type { TablesUpdate } from '@/lib/db/types'

/** «Готово» / «Да, состоялось» in the sphere's terms: Work → Erledigt, Body → Готово, others — checked. */
export function donePatch(sphere: string): TablesUpdate<'items'> {
  const done_at = new Date().toISOString()
  if (sphere === 'work') return { status: 'Erledigt', done_at }
  if (sphere === 'body') return { status: 'Готово', done_at }
  if (sphere === 'study') return { status: 'готово', done_at }
  return { done_at }
}

/** Undo of donePatch / a cancel: back to the status it had. */
export function reopenPatch(status: string | null, sphere: Sphere | string): TablesUpdate<'items'> {
  const fallback = sphere === 'work' ? 'Offen' : sphere === 'body' ? 'Не начато' : sphere === 'study' ? 'открыто' : null
  return { status: status ?? fallback, done_at: null }
}
