import type { TablesUpdate } from '@/lib/db/types'

/** New status → patch. Erledigt closes as done (done_at); Verworfen closes without being done; others reopen. */
export function statusPatch(status: string): TablesUpdate<'items'> {
  return { status, done_at: status === 'Erledigt' ? new Date().toISOString() : null }
}
