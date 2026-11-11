import { CalendarDays } from 'lucide-react'
import { Link } from 'react-router'
import type { Sphere } from '@/lib/constants'

/** Round 44px link to the calendar; from a sphere it opens filtered by that sphere. */
export function CalendarLink({ sphere }: { sphere?: Sphere }) {
  return (
    <Link
      to={sphere ? `/calendar?sphere=${sphere}` : '/calendar'}
      aria-label="Календарь"
      className="flex size-11 flex-none items-center justify-center rounded-full bg-sub text-ink active:bg-line2"
    >
      <CalendarDays size={20} strokeWidth={1.75} aria-hidden="true" />
    </Link>
  )
}
