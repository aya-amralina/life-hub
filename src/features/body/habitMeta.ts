import { Droplet, Leaf, Sunrise, type LucideIcon } from 'lucide-react'
import type { HabitKey } from '@/lib/rules/habits'

export const HABIT_META: Record<HabitKey, { label: string; icon: LucideIcon }> = {
  morning: { label: 'Утренний старт', icon: Sunrise },
  outside: { label: '10 мин на улице', icon: Leaf },
  water: { label: 'Вода', icon: Droplet },
}
