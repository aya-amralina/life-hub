import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { isNetworkError } from './offlineQueue'
import { useToast } from './toastContext'

export const REJECTED = 'Не сохранилось: сервер не принял изменение. На экране — то, что на сервере'
export const NO_CONNECTION = 'Не сохранилось: нет связи с сервером. Попробуй ещё раз'

/**
 * The text for a write that failed. Writes through the offline queue never fail for a missing network (they wait);
 * direct writes (envelopes, accounts, limits, notes, the review …) can — then it is the connection, not the server.
 */
export function rejectedText(error: unknown): string {
  const e = error && typeof error === 'object' ? (error as { message?: string; code?: string }) : { message: String(error) }
  return isNetworkError(e) ? NO_CONNECTION : REJECTED
}

/**
 * No write fails silently: every failed mutation of the app shows a toast. Each mutation itself rolls the screen back
 * (onError) or refetches what the server has (onSettled) — the toast says why the mark went back.
 */
export function useRejectedWrites() {
  const qc = useQueryClient()
  const toast = useToast()
  useEffect(
    () =>
      qc.getMutationCache().subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'error') toast({ text: rejectedText(event.action.error) })
      }),
    [qc, toast],
  )
}
