import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { IconButton } from './Button'

/**
 * Bottom sheet: 16px top radius, 36×4 handle, scrim. Closes by swipe down, scrim tap, ✕ and Esc.
 * `header` sits next to the close button (e.g. segmented tabs).
 */
export function BottomSheet({
  open,
  onClose,
  label,
  header,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  header?: ReactNode
  children: ReactNode
}) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<number | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sheetRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      setDragY(0)
    }
  }, [open, onClose])

  if (!open) return null

  const onPointerDown = (e: PointerEvent) => {
    start.current = e.clientY
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent) => {
    if (start.current !== null) setDragY(Math.max(0, e.clientY - start.current))
  }
  const onPointerUp = () => {
    if (dragY > 80) onClose()
    start.current = null
    setDragging(false)
    setDragY(0)
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Закрыть" tabIndex={-1} className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="pb-safe absolute inset-x-0 bottom-0 mx-auto flex max-h-[90dvh] max-w-[560px] flex-col rounded-t-2xl bg-card shadow-sheet outline-none"
        style={{ transform: `translateY(${dragY}px)`, transition: dragging ? 'none' : 'transform 150ms' }}
      >
        <div
          className="flex touch-none flex-col gap-4 px-4 pt-2"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="h-1 w-9 self-center rounded-sm bg-line2" />
          <div className="flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
            <div className="min-w-0 flex-1">{header ?? <h2 className="m-0 text-title font-semibold">{label}</h2>}</div>
            <IconButton label="Закрыть" onClick={onClose}>
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
