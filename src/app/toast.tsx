import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { ToastContext, type ShowToast, type ToastInput } from './toastContext'

type ToastData = ToastInput & { id: number }

/** Inverted toast above the tab bar with an optional action («Отменить»). Auto-hides after 5 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null)
  const seq = useRef(0)
  const show = useCallback<ShowToast>((t) => setToast({ ...t, id: ++seq.current }), [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-40 mx-auto max-w-[560px] px-4 print:hidden"
        style={{ bottom: 'calc(var(--nav-h) + 88px)' }}
      >
        {toast && (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center gap-3 rounded-xl bg-inv py-1 pr-1 pl-4 text-base text-on-inv shadow-sheet"
          >
            <Check size={20} strokeWidth={2} aria-hidden="true" className="flex-none" />
            <span className="min-w-0 flex-1 py-2.5 tabular-nums">{toast.text}</span>
            {toast.actionLabel && (
              <button
                type="button"
                className="flex h-11 items-center rounded-lg px-3 font-semibold active:bg-inv2"
                onClick={() => {
                  toast.onAction?.()
                  setToast(null)
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}
