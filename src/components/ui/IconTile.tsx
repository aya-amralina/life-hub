import type { LucideIcon } from 'lucide-react'
import { SPHERE_CLASS, type Sphere } from '@/lib/constants'
import { cn } from './cn'

/** 40×40 tile with the sphere icon on its soft colour (question cards, banners). */
export function IconTile({ icon: Icon, sphere }: { icon: LucideIcon; sphere: Sphere }) {
  return (
    <span className={cn('flex size-10 flex-none items-center justify-center rounded-xl', SPHERE_CLASS[sphere].soft, SPHERE_CLASS[sphere].text)}>
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
    </span>
  )
}
