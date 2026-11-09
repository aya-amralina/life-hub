import { EmptyState } from '@/components/ui/Feedback'
import { ScreenHeader } from '@/components/layout/ScreenHeader'

/** Temporary sphere screen until its stage lands. */
export function SpherePlaceholder({ title, soon }: { title: string; soon: string }) {
  return (
    <>
      <ScreenHeader title={title} />
      <EmptyState title="Раздел в работе">{soon}</EmptyState>
    </>
  )
}
