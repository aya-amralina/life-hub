import { NavLink } from 'react-router'
import { cn } from '@/components/ui/cn'

export type RouteTab = { to: string; label: string; end?: boolean }

/**
 * Tabs that are addresses (a sphere's sections): links with aria-current, so back / forward and deep links work.
 * `variant` — «main»: text tabs under the header (the active one 600 with an underline); «sub»: the look of
 * SegmentedTabs (44px segments on a subtle fill) for the screens inside a tab.
 */
export function RouteTabs({ tabs, label, variant = 'main' }: { tabs: readonly RouteTab[]; label: string; variant?: 'main' | 'sub' }) {
  if (variant === 'sub') {
    return (
      <nav aria-label={label} className="flex gap-1 rounded-xl bg-sub p-1">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn('flex h-11 min-w-0 flex-1 items-center justify-center truncate rounded-lg px-2 text-base no-underline', isActive ? 'bg-card font-semibold text-ink shadow-seg' : 'text-ink2')
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    )
  }
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn('flex h-11 flex-none items-center border-b-2 px-2 text-base no-underline', isActive ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink2')
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
