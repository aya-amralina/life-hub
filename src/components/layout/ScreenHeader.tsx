import type { ReactNode } from 'react'

/** Screen header: 32px top offset, optional eyebrow, big title, right slot for actions. */
export function ScreenHeader({ eyebrow, title, left, right }: { eyebrow?: ReactNode; title: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex items-start gap-2 pt-8">
      {left}
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="text-cap text-ink2">{eyebrow}</div>}
        <h1 className="m-0 text-big font-semibold tracking-[-0.01em] tabular-nums">{title}</h1>
      </div>
      {right}
    </header>
  )
}
