import { useMemo } from 'react'
import type { ISODate } from '@/lib/dates'
import { isItemOpen } from '@/lib/rules/items'
import { hoursDone, studyItemsOfWeek, weekCapacity, weekLoad } from '@/lib/rules/study'
import { useItems } from '@/features/items/api'
import { useWeek } from '@/features/weeks/api'

/** Study week: items of the week, load (rule 7) and hours already closed. */
export function useStudyWeek(monday: ISODate) {
  const week = useWeek(monday)
  const items = useItems()
  return useMemo(() => {
    const list = studyItemsOfWeek(items.data ?? [], monday, week.data?.id ?? null)
    const load = weekLoad(list, weekCapacity(week.data))
    return {
      week: week.data ?? null,
      items: list,
      load,
      done: hoursDone(list),
      itemsDone: list.filter((i) => !isItemOpen(i)).length,
      pending: week.isPending || items.isPending,
      all: items.data ?? [],
    }
  }, [items.data, items.isPending, week.data, week.isPending, monday])
}
