import { useSyncExternalStore } from 'react'

/** Laptop layout: side rail instead of the bottom bar, «Список / Таблица» in Work and Study. */
export const DESKTOP = '(min-width: 1024px)'

/** A CSS media query as React state (false where matchMedia is not there, e.g. tests). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (on) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mq = window.matchMedia(query)
      mq.addEventListener('change', on)
      return () => mq.removeEventListener('change', on)
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  )
}
