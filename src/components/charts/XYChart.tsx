import { formatChartNumber as chartNumber } from '@/lib/format'
import type { SphereColor, XYAxis, XYBand, XYBar, XYLine } from './chartParts'
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const color = (c: SphereColor) => `var(--${c})`

export type XYChartProps = Parameters<typeof XYChart>[0]

/**
 * ChartXY of the design system on Recharts: lines (2px, the second series of a sphere dashed, gaps = no mark),
 * bars (≤ 18px, rounded top, the right axis at .28), bands (ink at .07 with a label), the «сейчас» marker,
 * a tooltip on tap (inverted), axes labels 13 ink3, grid on ticks only. Empty — only the axes and a note.
 */
export function XYChart({
  data,
  lines = [],
  bars = [],
  yLeft,
  yRight,
  bands = [],
  todayKey,
  todayLabel = 'сейчас',
  height = 168,
  empty = false,
  emptyText = 'Мало данных — график появится через неделю отметок',
  label,
}: {
  data: readonly ({ key: string; label: string } & Record<string, unknown>)[]
  lines?: XYLine[]
  bars?: XYBar[]
  yLeft?: XYAxis
  yRight?: XYAxis
  bands?: XYBand[]
  todayKey?: string
  todayLabel?: string
  height?: number
  empty?: boolean
  emptyText?: string
  label: string
}) {
  const labelOf = new Map(data.map((d) => [d.key, d.label]))
  const step = Math.max(1, Math.ceil(data.length / 5))
  // axis width from the longest tick label (13px digits ≈ 8px each)
  const axisWidth = (axis?: XYAxis) => (axis?.ticks ? 10 + 8 * Math.max(...axis.ticks.map((t) => (chartNumber(t) + (axis.unit ?? '')).length)) : 8)
  // a dot only for a single value between gaps; joined values are just the line
  const lonelyDot = (key: string, fill: string) =>
    function Dot(props: { cx?: number; cy?: number; index?: number }) {
      const i = props.index ?? 0
      const isLone = data[i - 1]?.[key] == null && data[i + 1]?.[key] == null && data[i]?.[key] != null
      return isLone && props.cx !== undefined && props.cy !== undefined ? <circle key={`${key}-${i}`} cx={props.cx} cy={props.cy} r={1.5} fill={fill} /> : <g key={`${key}-${i}`} />
    }
  return (
    <figure className="relative m-0" aria-label={label} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={empty ? [] : [...data]} margin={{ top: 12, right: yRight ? 0 : 8, bottom: 0, left: 0 }} barCategoryGap="40%">
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="key"
            tickFormatter={(k: string) => labelOf.get(k) ?? ''}
            interval={step - 1}
            tick={{ fill: 'var(--ink3)', fontSize: 13 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--line2)' }}
            height={24}
          />
          <YAxis
            yAxisId="left"
            domain={yLeft?.domain ?? ['auto', 'auto']}
            ticks={yLeft?.ticks}
            tickFormatter={(v: number) => chartNumber(v) + (yLeft?.unit ?? '')}
            tick={{ fill: 'var(--ink3)', fontSize: 13 }}
            tickLine={false}
            axisLine={false}
            width={axisWidth(yLeft)}
            hide={!yLeft?.ticks}
          />
          {yRight && (
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={yRight.domain}
              ticks={yRight.ticks}
              tickFormatter={(v: number) => chartNumber(v) + (yRight.unit ?? '')}
              tick={{ fill: 'var(--ink3)', fontSize: 13 }}
              tickLine={false}
              axisLine={false}
              width={axisWidth(yRight)}
            />
          )}
          {bands.map((b) => (
            <ReferenceArea
              key={`${b.from}-${b.label}`}
              yAxisId="left"
              x1={b.from}
              x2={b.to}
              fill="var(--ink)"
              fillOpacity={0.07}
              ifOverflow="hidden"
              label={{ value: b.label, position: 'insideTopLeft', fill: 'var(--ink2)', fontSize: 13 }}
            />
          ))}
          {bars.map((b) => (
            <Bar
              key={b.key}
              dataKey={b.key}
              name={b.name}
              yAxisId={b.axis ?? 'left'}
              fill={color(b.color)}
              fillOpacity={b.opacity ?? (b.axis === 'right' ? 0.28 : 1)}
              maxBarSize={18}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
              unit={b.unit}
            />
          ))}
          {lines.map((l) => (
            <Line
              key={l.key}
              dataKey={l.key}
              name={l.name}
              yAxisId={l.axis ?? 'left'}
              type="linear"
              stroke={color(l.color)}
              strokeWidth={2}
              strokeDasharray={l.dash ? '5 4' : undefined}
              strokeLinecap="round"
              dot={lonelyDot(l.key, color(l.color))}
              activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
              unit={l.unit}
            />
          ))}
          {todayKey && labelOf.has(todayKey) && (
            <ReferenceLine
              yAxisId="left"
              x={todayKey}
              stroke="var(--line2)"
              label={{ value: todayLabel, position: 'insideTopRight', fill: 'var(--ink)', fontSize: 13, fontWeight: 600 }}
            />
          )}
          {!empty && (
            <Tooltip
              cursor={{ stroke: 'var(--ink3)', strokeWidth: 1 }}
              labelFormatter={(k) => labelOf.get(String(k)) ?? String(k)}
              formatter={(v, name, item) => [`${chartNumber(Number(v))}${(item as { unit?: string }).unit ?? ''}`, name]}
              contentStyle={{ background: 'var(--inv)', border: 0, borderRadius: 8, boxShadow: 'var(--shadow)', padding: '6px 10px', fontSize: 13 }}
              labelStyle={{ color: 'var(--on-inv)', fontWeight: 600 }}
              itemStyle={{ color: 'var(--on-inv)', padding: 0 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {empty && (
        <figcaption className="absolute inset-x-0 top-1/2 mx-auto w-fit max-w-60 -translate-y-1/2 rounded-lg bg-card px-2 py-1 text-center text-cap text-ink2">
          {emptyText}
        </figcaption>
      )}
    </figure>
  )
}
