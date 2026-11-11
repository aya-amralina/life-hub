import { useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { idb } from './idb'

/**
 * Offline queue of changes (SPEC §1): a write that cannot reach Supabase (no network) is kept in IndexedDB and
 * sent in order when the network is back. The screens already show the change (optimistic caches); rows get
 * their id on the client, so an insert made offline can be undone or edited before it is sent.
 */
export type Op =
  | { table: string; action: 'insert'; values: Record<string, unknown> }
  | { table: string; action: 'upsert'; values: Record<string, unknown>; onConflict: string }
  | { table: string; action: 'update'; id: string; values: Record<string, unknown> }
  | { table: string; action: 'delete'; id: string }

type Queued = Op & { seq?: number; at: string }

let pending = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

async function refreshCount() {
  try {
    pending = (await idb.all<Queued>()).length
  } catch {
    pending = 0
  }
  emit()
}

/** A fetch that never reached the server (offline, flaky network) — as opposed to an error from the server. */
export function isNetworkError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return !error.code && /fetch|network|load failed|timed? ?out/i.test(error.message ?? '')
}

async function send(op: Op): Promise<{ message?: string; code?: string } | null> {
  const t = supabase.from(op.table as 'items')
  const res =
    op.action === 'insert'
      ? await t.insert(op.values as never)
      : op.action === 'upsert'
        ? await t.upsert(op.values as never, { onConflict: op.onConflict })
        : op.action === 'update'
          ? await t.update(op.values as never).eq('id', op.id)
          : await t.delete().eq('id', op.id)
  return res.error
}

/** Write now, or queue it when the network is not there. Throws only on a real server error. */
export async function write(op: Op): Promise<'sent' | 'queued'> {
  if (pending === 0 && navigator.onLine) {
    const error = await send(op)
    if (!error) return 'sent'
    if (!isNetworkError(error)) throw error
  }
  // keep the order: once something waits, later changes wait behind it
  await idb.add({ ...op, at: new Date().toISOString() } satisfies Queued)
  await refreshCount()
  return 'queued'
}

let flushing = false

/** Send queued changes in order; stops at the first network failure. Changes the server rejects are dropped. */
export async function flush(qc?: QueryClient): Promise<{ sent: number; dropped: number }> {
  if (flushing || !navigator.onLine) return { sent: 0, dropped: 0 }
  flushing = true
  let sent = 0
  let dropped = 0
  try {
    const queue = await idb.all<Queued>()
    for (const q of queue) {
      const error = await send(q)
      if (error && isNetworkError(error)) break
      if (error) dropped += 1
      else sent += 1
      await idb.remove(q.seq!)
    }
  } finally {
    flushing = false
    await refreshCount()
  }
  if (sent + dropped > 0) await qc?.invalidateQueries()
  return { sent, dropped }
}

export function usePendingChanges(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => pending,
    () => 0,
  )
}

void refreshCount()
