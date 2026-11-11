import { lazy, Suspense } from 'react'
import type { XYChartProps } from './XYChart'

// Recharts is heavy: the chart code loads on first use, in its own chunk (the app shell stays light on the phone).
const Inner = lazy(() => import('./XYChart').then((m) => ({ default: m.XYChart })))

/** XYChart, loaded lazily; a pulsing placeholder of the same height meanwhile. */
export function XYChart(props: XYChartProps) {
  return (
    <Suspense fallback={<div aria-hidden="true" className="animate-skeleton rounded-xl bg-sub" style={{ height: props.height ?? 168 }} />}>
      <Inner {...props} />
    </Suspense>
  )
}
