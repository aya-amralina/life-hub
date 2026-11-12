import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query'
import { idb } from './idb'

const KEY = 'query-cache'
const MAX_AGE = 7 * 24 * 3_600_000
// Shape of the cached rows. Bump when a migration adds a column the screens rely on (entry_kind, coffee_cups …):
// a cache saved before it is dropped, not shown — otherwise old rows look like something else for a moment
// (a week budget without entry_kind asked «Списалось?»).
const VERSION = 2

/**
 * Read cache for offline (SPEC §1): successful queries are kept in IndexedDB, so the app opens without network
 * with the last data. Restored once at start (then refetched when online); saved (throttled) whenever the cache
 * changes and at once when the app goes to the background.
 */
export function persistQueryCache(qc: QueryClient) {
  void idb
    .get<{ at: number; v?: number; state: DehydratedState }>(KEY)
    .then((saved) => {
      if (!saved || saved.v !== VERSION || Date.now() - saved.at >= MAX_AGE) return
      hydrate(qc, saved.state)
      // restored data is only a fallback: mark it stale so screens refetch (when there is network)
      void qc.invalidateQueries()
    })
    .catch(() => {})

  let timer: ReturnType<typeof setTimeout> | null = null
  const save = () => {
    if (timer) clearTimeout(timer)
    timer = null
    const state = dehydrate(qc, { shouldDehydrateQuery: (q) => q.state.status === 'success' })
    void idb.set(KEY, { at: Date.now(), v: VERSION, state }).catch(() => {})
  }
  qc.getQueryCache().subscribe(() => {
    if (!timer) timer = setTimeout(save, 2000)
  })
  // the app going to the background (or closing) saves at once
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save())
  window.addEventListener('pagehide', save)
}
