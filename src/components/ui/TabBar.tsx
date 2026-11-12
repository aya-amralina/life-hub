import { BookOpen, Briefcase, PersonStanding, Sun, Wallet, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router'
import { cn } from './cn'

type Tab = { to: string; label: string; icon: LucideIcon; activeIcon: string }

const TABS: readonly Tab[] = [
  { to: '/', label: 'Сегодня', icon: Sun, activeIcon: 'text-ink' },
  { to: '/money', label: 'Деньги', icon: Wallet, activeIcon: 'text-money' },
  { to: '/work', label: 'Работа', icon: Briefcase, activeIcon: 'text-work' },
  { to: '/study', label: 'Учёба', icon: BookOpen, activeIcon: 'text-study' },
  { to: '/body', label: 'Тело', icon: PersonStanding, activeIcon: 'text-body' },
]

/**
 * Bottom tab bar. Active: icon in sphere colour (Сегодня — neutral), label 600.
 * Publishes its real height (safe area, text size) as --nav-h: the content padding, «+» and the toast sit above it.
 */
export function TabBar() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const set = () => root.style.setProperty('--nav-h', `${Math.ceil(el.getBoundingClientRect().height)}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--nav-h')
    }
  }, [])
  return (
    <nav
      ref={ref}
      aria-label="Разделы"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card px-1 pt-1.5 print:hidden"
    >
      <ul className="mx-auto grid max-w-[560px] grid-cols-5">
        {TABS.map(({ to, label, icon: Glyph, activeIcon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-12 flex-col items-center justify-center gap-0.5 text-cap no-underline',
                  isActive ? 'font-semibold text-ink' : 'text-ink3',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Glyph size={24} strokeWidth={isActive ? 2 : 1.75} className={isActive ? activeIcon : undefined} aria-hidden="true" />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
