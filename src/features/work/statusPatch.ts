import type { TablesUpdate } from '@/lib/db/types'

/** New status → patch. Erledigt / Verworfen close the item; any other status reopens it. */
export function statusPatch(status: string): TablesUpdate<'items'> {
  const closes = status === 'Erledigt' || status === 'Verworfen'
  return { status, done_at: closes ? new Date().toISOString() : null }
}
