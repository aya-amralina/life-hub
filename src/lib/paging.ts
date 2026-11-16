/** Rows asked per request. The server may return fewer (Supabase `max_rows`, 1000 in the cloud project). */
export const PAGE_SIZE = 1000

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>

/**
 * Every row of a query, page by page. `page(from, to)` runs the query with `.range(from, to)` and a stable order
 * (ending in `id`). The next page starts after the rows actually received — a server that caps pages below
 * `size` must not cut the list short — and it stops on an empty page. A row met twice (a write between two
 * requests shifted the pages) is kept once.
 */
export async function fetchAllPages<T extends { id: string }>(page: (from: number, to: number) => Page<T>, size = PAGE_SIZE): Promise<T[]> {
  const out: T[] = []
  const seen = new Set<string>()
  for (let from = 0; ; ) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw error
    if (!data?.length) return out
    for (const row of data) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      out.push(row)
    }
    from += data.length
  }
}
