import { createContext, useContext } from 'react'
import type { Sphere } from '@/lib/constants'

export type AddMode = 'expense' | 'item' | 'note'
export type OpenAdd = (mode?: AddMode, opts?: { sphere?: Sphere; date?: string }) => void

export const AddSheetContext = createContext<OpenAdd>(() => {})

/** Open the «+» sheet from anywhere (e.g. «+ трата» on Today). */
export function useOpenAdd(): OpenAdd {
  return useContext(AddSheetContext)
}
