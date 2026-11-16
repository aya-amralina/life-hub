import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, fetchAllPages } from './paging'

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }))

/** A fake server over `all` that returns at most `cap` rows per request and records the asked ranges. */
function server(all: { id: string }[], cap = Infinity) {
  const asked: [number, number][] = []
  const page = async (from: number, to: number) => {
    asked.push([from, to])
    return { data: all.slice(from, Math.min(to + 1, from + cap)), error: null }
  }
  return { page, asked }
}

describe('fetchAllPages: glues pages without trusting the page size', () => {
  it('glues full pages and the rest, asking consecutive ranges', async () => {
    const s = server(rows(2001))
    const got = await fetchAllPages(s.page)
    expect(got).toHaveLength(2001)
    expect(got[2000]!.id).toBe('r2000')
    expect(s.asked).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [2001, 3000],
    ])
  })

  it('a server capped at 500 per request (max_rows below PAGE_SIZE) still gives every row', async () => {
    expect(PAGE_SIZE).toBe(1000)
    const s = server(rows(1700), 500)
    const got = await fetchAllPages(s.page)
    expect(got.map((r) => r.id)).toEqual(rows(1700).map((r) => r.id))
    expect(s.asked.map(([from]) => from)).toEqual([0, 500, 1000, 1500, 1700])
  })

  it('exactly one full page: one more request comes back empty', async () => {
    const s = server(rows(1000))
    expect(await fetchAllPages(s.page)).toHaveLength(1000)
    expect(s.asked).toHaveLength(2)
  })

  it('an empty table is one request', async () => {
    const s = server([])
    expect(await fetchAllPages(s.page)).toEqual([])
    expect(s.asked).toHaveLength(1)
  })

  it('a row seen twice (pages shifted by a write) is kept once', async () => {
    let call = 0
    const page = async () => {
      call += 1
      return { data: call === 1 ? [{ id: 'a' }, { id: 'b' }] : call === 2 ? [{ id: 'b' }, { id: 'c' }] : [], error: null }
    }
    expect((await fetchAllPages(page, 2)).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('an error is thrown, not swallowed', async () => {
    const boom = { message: 'permission denied', code: '42501' }
    await expect(fetchAllPages(async () => ({ data: null, error: boom }))).rejects.toBe(boom)
  })
})
