// Chart types and the legend — no Recharts here, so screens can import them without loading the chart library.

export type SphereColor = 'money' | 'work' | 'study' | 'body' | 'ink2'
export type XYLine = { key: string; name: string; color: SphereColor; dash?: boolean; axis?: 'left' | 'right'; unit?: string }
// minPointSize: a real 0 drawn as a thin stub, so it differs from a gap (null)
export type XYBar = { key: string; name: string; color: SphereColor; axis?: 'left' | 'right'; opacity?: number; unit?: string; minPointSize?: number }
export type XYAxis = { domain: [number | 'auto', number | 'auto']; ticks?: number[]; unit?: string }
export type XYBand = { from: string; to: string; label: string }

const color = (c: SphereColor) => `var(--${c})`

/** Line legend row: sample 12×2 (dashed for the second series) + name; bars as an 8×8 square. */
export function ChartLegend({ items }: { items: { name: string; color: SphereColor; kind: 'line' | 'dash' | 'bar' }[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-cap text-ink2">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-2">
          {i.kind === 'bar' ? (
            <span className="size-2 rounded-[2px] opacity-30" style={{ background: color(i.color) }} />
          ) : (
            <span
              className="h-0.5 w-3"
              style={{ background: i.kind === 'dash' ? `repeating-linear-gradient(90deg, ${color(i.color)} 0 4px, transparent 4px 7px)` : color(i.color) }}
            />
          )}
          {i.name}
        </li>
      ))}
    </ul>
  )
}
