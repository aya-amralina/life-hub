import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { ScreenHeader } from './ScreenHeader'

export type MoreLink = { to: string; label: string; icon: LucideIcon; hint?: string; lang?: string }

/**
 * «Ещё» at the bottom of a sphere screen: everything beyond the main view, one tap deeper.
 * Rows are links (each section has its own address and «+»).
 */
export function MoreList({ links }: { links: readonly MoreLink[] }) {
  return (
    <nav aria-label="Ещё" className="flex flex-col gap-2 pt-4">
      <h2 className="m-0 px-1 text-cap font-semibold text-ink2">Ещё</h2>
      <ul className="m-0 flex list-none flex-col rounded-2xl border border-line bg-card px-4 py-1">
        {links.map(({ to, label, icon: Glyph, hint, lang }) => (
          <li key={to} className="border-t border-line first:border-t-0">
            <Link to={to} className="flex min-h-12 items-center gap-3 py-2 text-ink no-underline active:bg-sub">
              <Glyph size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink2" />
              <span lang={lang} className="min-w-0 flex-1 text-base">
                {label}
              </span>
              {hint && <span className="text-cap text-ink2 tabular-nums">{hint}</span>}
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="flex-none text-ink3" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Header of a section opened from «Ещё»: back to the sphere, the sphere as eyebrow. */
export function SectionHeader({ title, back, sphere, right }: { title: string; back: string; sphere: string; right?: ReactNode }) {
  return (
    <ScreenHeader
      eyebrow={sphere}
      title={title}
      left={
        <Link
          to={back}
          aria-label={`Назад: ${sphere}`}
          className="-ml-2 flex size-11 flex-none items-center justify-center rounded-full text-ink active:bg-sub"
        >
          <ChevronLeft size={24} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      }
      right={right}
    />
  )
}
