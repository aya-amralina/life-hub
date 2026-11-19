import { Circle, Droplet, Leaf, PersonStanding, Sunrise, type LucideIcon } from 'lucide-react'

/** Icons a habit may name (habits.icon); an unknown or empty one — a plain circle. */
const ICONS: Record<string, LucideIcon> = { sunrise: Sunrise, leaf: Leaf, droplet: Droplet, 'person-standing': PersonStanding }

export function habitIcon(icon: string | null | undefined): LucideIcon {
  return (icon && ICONS[icon]) || Circle
}
