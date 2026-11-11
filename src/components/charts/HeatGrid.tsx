import { useState } from 'react'
import { cn } from '@/components/ui/cn'
import type { GridCell } from '@/lib/rules/charts'
import type { SphereColor } from './chartParts'

/**
 * ChartGrid of the design system: cells by level — null dashed, 0 «--sub», 1…max color-mix of the sphere with
 * the card (mix steps), the top step solid with «--on-sphere» text. The current cell has a 1.5px ink border;
 * cells are smaller than a finger, so the tapped cell's text shows in a line under the grid.
 */
export function HeatGrid({
  cells,
  cols,
  rows,
  flow = 'row',
  cell = [22, 32],
  color,
  mix = [0, 28, 58, 100],
  legend,
  rowLabels,
  hint,
  label,
}: {
  cells: readonly GridCell[]
  cols: number
  rows: number
  flow?: 'row' | 'column'
  cell?: [number, number]
  color: SphereColor
  mix?: number[]
  legend?: { level: number | null; text: string }[]
  rowLabels?: string[]
  hint: string
  label: string
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const max = mix.length - 1
  const fill = (level: number | null) => {
    if (level === null) return { background: 'transparent', border: '1px dashed var(--line2)' }
    if (level === 0) return { background: 'var(--sub)' }
    const pct = mix[Math.min(level, max)]!
    return pct >= 100 ? { background: `var(--${color})` } : { background: `color-mix(in oklch, var(--${color}) ${pct}%, var(--card))` }
  }
  const tip = cells.find((c) => c.key === picked)?.tip
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {rowLabels && (
          <div className="grid gap-[3px] text-cap text-ink3" style={{ gridTemplateRows: `repeat(${rows}, ${cell[1]}px)` }}>
            {rowLabels.map((r, i) => (
              <span key={i} className="flex w-6 items-center leading-none">
                {r}
              </span>
            ))}
          </div>
        )}
        <div
          role="grid"
          aria-label={label}
          className="grid gap-[3px] overflow-x-auto"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${cell[0]}px)`,
            gridTemplateRows: `repeat(${rows}, ${cell[1]}px)`,
            gridAutoFlow: flow,
          }}
        >
          {cells.map((c) => {
            const top = c.level !== null && c.level >= max
            return (
              <button
                key={c.key}
                type="button"
                aria-label={c.tip}
                aria-pressed={picked === c.key}
                onClick={() => setPicked(picked === c.key ? null : c.key)}
                className={cn(
                  'flex items-center justify-center rounded-[6px] text-[11px] leading-none tabular-nums',
                  top ? 'text-on-sphere' : c.level === null ? 'text-ink3' : 'text-ink',
                  c.current && 'border-[1.5px] border-solid border-ink font-semibold',
                  picked === c.key && 'outline-2 outline-offset-1 outline-ink',
                )}
                style={c.current ? { ...fill(c.level), border: undefined } : fill(c.level)}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </div>
      <p className={cn('m-0 min-h-[18px] text-cap', tip ? 'font-semibold text-ink' : 'text-ink3')}>{tip ?? hint}</p>
      {legend && (
        <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-cap text-ink2">
          {legend.map((l) => (
            <li key={l.text} className="flex items-center gap-1">
              <span className="size-3 rounded-[3px]" style={fill(l.level)} />
              {l.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
