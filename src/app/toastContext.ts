import { createContext, useContext } from 'react'

export type ToastInput = { text: string; actionLabel?: string; onAction?: () => void }
export type ShowToast = (t: ToastInput) => void

export const ToastContext = createContext<ShowToast>(() => {})

export function useToast(): ShowToast {
  return useContext(ToastContext)
}
