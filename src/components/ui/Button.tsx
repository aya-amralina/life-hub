import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'quiet'

const VARIANT: Record<Variant, string> = {
  primary:
    'h-12 px-4 bg-inv text-on-inv active:bg-inv2 active:scale-[.98] disabled:bg-sub disabled:text-dis disabled:scale-100',
  secondary:
    'h-12 px-4 bg-card text-ink border border-line2 active:bg-sub active:scale-[.98] disabled:bg-transparent disabled:border-line disabled:text-dis disabled:scale-100',
  quiet: 'h-11 px-3 gap-1 text-ink active:bg-sub disabled:text-dis',
}

export function Button({
  variant = 'primary',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: { variant?: Variant; icon?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl text-base font-semibold transition-transform duration-100 select-none disabled:cursor-default',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

/** 44×44 icon button: round on subtle fill, or square outlined. */
export function IconButton({
  shape = 'round',
  label,
  className,
  children,
  type = 'button',
  ...rest
}: { shape?: 'round' | 'square'; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-11 flex-none items-center justify-center text-ink transition-transform duration-100 active:scale-[.96]',
        shape === 'round' ? 'rounded-full bg-sub active:bg-line2' : 'rounded-xl border border-line2 active:bg-sub',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
