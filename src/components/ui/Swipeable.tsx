import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Check, Redo2, type LucideIcon } from 'lucide-react'
import { cn } from './cn'

const THRESHOLD = 80
const LONG_PRESS_MS = 500

/**
 * Gestures on a row: swipe right — done, swipe left — move on, long press — open the card.
 * Vertical scrolling stays native (touch-action: pan-y); taps inside still work.
 */
export function Swipeable({
  onRight,
  onLeft,
  onLongPress,
  rightLabel = 'Готово',
  leftLabel = 'Перенести',
  leftIcon: LeftIcon = Redo2,
  children,
}: {
  onRight?: () => void
  onLeft?: () => void
  onLongPress?: () => void
  rightLabel?: string
  leftLabel?: string
  leftIcon?: LucideIcon
  children: ReactNode
}) {
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const horizontal = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressed = useRef(false)

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const down = (e: PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY }
    horizontal.current = false
    pressed.current = false
    if (onLongPress) {
      timer.current = setTimeout(() => {
        pressed.current = true
        onLongPress()
      }, LONG_PRESS_MS)
    }
  }
  const move = (e: PointerEvent) => {
    if (!start.current) return
    const x = e.clientX - start.current.x
    const y = e.clientY - start.current.y
    if (Math.abs(x) > 8 || Math.abs(y) > 8) clear()
    if (!horizontal.current && Math.abs(x) > 12 && Math.abs(x) > Math.abs(y) * 1.5) horizontal.current = true
    if (horizontal.current) {
      setDragging(true)
      setDx(Math.max(onLeft ? -120 : 0, Math.min(onRight ? 120 : 0, x)))
    }
  }
  const up = () => {
    clear()
    if (dx >= THRESHOLD) onRight?.()
    else if (dx <= -THRESHOLD) onLeft?.()
    start.current = null
    setDragging(false)
    setDx(0)
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      {dx !== 0 && (
        <div
          aria-hidden="true"
          className={cn('absolute inset-0 flex items-center px-4 text-cap font-semibold', dx > 0 ? 'justify-start bg-inv text-on-inv' : 'justify-end bg-sub text-ink')}
        >
          {dx > 0 ? (
            <span className="flex items-center gap-1">
              <Check size={16} strokeWidth={2} /> {rightLabel}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              {leftLabel} <LeftIcon size={16} strokeWidth={2} />
            </span>
          )}
        </div>
      )}
      <div
        className="relative touch-pan-y"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dragging ? 'none' : 'transform 150ms' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => {
          // a long press or a swipe is not a tap
          if (pressed.current || horizontal.current) {
            e.stopPropagation()
            e.preventDefault()
            pressed.current = false
            horizontal.current = false
          }
        }}
        onContextMenu={(e) => onLongPress && e.preventDefault()}
      >
        {children}
      </div>
    </div>
  )
}
