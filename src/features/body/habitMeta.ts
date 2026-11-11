import { Droplet, Leaf, Sunrise, type LucideIcon } from 'lucide-react'
import { joinRu } from '@/lib/format'
import type { HabitKey } from '@/lib/rules/habits'

export const HABIT_META: Record<HabitKey, { label: string; phrase: string; icon: LucideIcon }> = {
  morning: { label: 'Утренний старт', phrase: 'утренний старт', icon: Sunrise },
  outside: { label: '10 мин на улице', phrase: '10 минут на улице', icon: Leaf },
  water: { label: 'Вода', phrase: 'вода', icon: Droplet },
}

// Water first reads naturally: «вода и 10 минут на улице».
const PHRASE_ORDER: HabitKey[] = ['water', 'outside', 'morning']

/** «вода и 10 минут на улице» — the minimum set in words (rule 13: the card names it). */
export function minimumPhrase(set: readonly HabitKey[]): string {
  return joinRu(PHRASE_ORDER.filter((k) => set.includes(k)).map((k) => HABIT_META[k].phrase))
}
