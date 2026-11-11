import type { ReactNode } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'

/** Chart card (design 06): title 16/600 with the sphere dot, context 13 on the right, the chart under it. */
export function ChartCard({ title, dotClass, context, children }: { title: string; dotClass?: string; context?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} dotClass={dotClass} context={context} />
      {children}
    </Card>
  )
}
