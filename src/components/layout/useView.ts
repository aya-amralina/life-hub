import { useState } from 'react'
import { DESKTOP, useMediaQuery } from '@/app/useMediaQuery'

export type View = 'list' | 'table'

/** «Список / Таблица» of a sphere: only on a laptop (≥ 1024 px); the choice is kept on the device. */
export function useView(sphere: 'work' | 'study'): [View, (v: View) => void, boolean] {
  const desktop = useMediaQuery(DESKTOP)
  const key = `lifehub.view.${sphere}`
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(key) === 'table' ? 'table' : 'list'
    } catch {
      return 'list'
    }
  })
  const set = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(key, v)
    } catch {
      // private mode: the choice lives until reload
    }
  }
  // on a narrow screen it is always the list
  return [desktop ? view : 'list', set, desktop]
}

