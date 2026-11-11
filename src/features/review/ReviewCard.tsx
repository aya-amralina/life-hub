import { NotebookPen } from 'lucide-react'
import { Link } from 'react-router'
import { IconTile } from '@/components/ui/IconTile'
import type { ISODate } from '@/lib/dates'
import { reviewDue, reviewWeek } from '@/lib/rules/review'
import { useWeek } from '@/features/weeks/api'
import { useReview } from './api'

/** «Воскресный обзор» on «Сегодня»: from Saturday through Monday, until this week's review is completed. */
export function ReviewCard({ today }: { today: ISODate }) {
  const week = useWeek(reviewWeek(today))
  const review = useReview(week.data?.id ?? null)
  if (week.isPending || (week.data && review.isPending)) return null
  const done = Boolean(review.data?.completed_at)
  if (!reviewDue(today, done)) return null
  const started = Boolean(review.data)
  return (
    <section className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4" aria-label="Воскресный обзор">
      <IconTile icon={NotebookPen} sphere="personal" />
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold">Воскресный обзор</div>
        <div className="text-cap text-ink2">{started ? 'Начат — можно продолжить с того же места' : 'Деньги → Тело → Учёба → Работа → Вперёд · ~7 мин'}</div>
      </div>
      <Link to="/review" className="flex h-11 flex-none items-center rounded-xl bg-inv px-4 text-base font-semibold text-on-inv no-underline">
        {started ? 'Продолжить' : 'Начать'}
      </Link>
    </section>
  )
}
