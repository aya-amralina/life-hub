import { createContext, useContext, useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import type { Sphere } from '@/lib/constants'

/** What the shared «Добавить» sheet shows: the chooser (Сегодня) or one sphere's own form. */
export type AddForm = 'choose' | 'expense' | 'personal' | 'work' | 'study' | 'body' | 'note'
export type OpenAdd = (form?: AddForm, opts?: { sphere?: Sphere; date?: string }) => void

export const AddSheetContext = createContext<OpenAdd>(() => {})

/** Open the «Добавить» sheet from anywhere (empty states, the calendar day). */
export function useOpenAdd(): OpenAdd {
  return useContext(AddSheetContext)
}

type Register = (path: string, run: () => void) => () => void
export const AddActionContext = createContext<Register>(() => () => {})

/**
 * «+» adds what is on screen: a sphere screen or section registers its own action for its path
 * (a new activity on Тело → День, a debt on Конверты…). The registration lives while the screen is mounted.
 */
export function useAddAction(run: () => void) {
  const register = useContext(AddActionContext)
  const { pathname } = useLocation()
  const latest = useRef(run)
  useEffect(() => {
    latest.current = run
  })
  useEffect(() => register(pathname, () => latest.current()), [register, pathname])
}
