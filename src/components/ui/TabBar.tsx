import { BookOpen, Briefcase, PersonStanding, Sun, Wallet, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router'
import { DESKTOP } from '@/app/useMediaQuery'
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
 * From 1024 px it is a rail on the left (laptop): nothing at the bottom, --nav-h is 0.
 */
export function TabBar() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const rail = window.matchMedia(DESKTOP)
    const set = () => root.style.setProperty('--nav-h', rail.matches ? '0px' : `${Math.ceil(el.getBoundingClientRect().height)}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    rail.addEventListener('change', set)
    return () => {
      ro.disconnect()
      rail.removeEventListener('change', set)
      root.style.removeProperty('--nav-h')
    }
  }, [])
  return (
    <nav
      ref={ref}
      aria-label="Разделы"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card px-1 pt-1.5 print:hidden lg:inset-y-0 lg:right-auto lg:w-24 lg:border-t-0 lg:border-r lg:px-2 lg:pt-8"
    >
      <ul className="mx-auto grid max-w-[560px] grid-cols-5 lg:grid-cols-1 lg:gap-2">
        {TABS.map(({ to, label, icon: Glyph, activeIcon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-12 flex-col items-center justify-center gap-0.5 text-cap no-underline lg:min-h-16 lg:rounded-xl lg:hover:bg-sub',
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
