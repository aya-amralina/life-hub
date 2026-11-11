import { useMemo } from 'react'
import type { ISODate } from '@/lib/dates'
import { isItemDone } from '@/lib/rules/items'
import { hoursDone, plannedItems, studyItemsOfWeek, weekCapacity, weekLoad } from '@/lib/rules/study'
import { useItems } from '@/features/items/api'
import { useWeek } from '@/features/weeks/api'

/** Study week: planned items of the week, load (rule 7) and hours already closed. */
export function useStudyWeek(monday: ISODate) {
  const week = useWeek(monday)
  const items = useItems()
  return useMemo(() => {
    // «снято» leaves the plan and the load (rule 7 counts what is still planned or done).
    const list = plannedItems(studyItemsOfWeek(items.data ?? [], monday, week.data?.id ?? null))
    const load = weekLoad(list, weekCapacity(week.data))
    return {
      week: week.data ?? null,
      items: list,
      load,
      done: hoursDone(list),
      itemsDone: list.filter((i) => isItemDone(i)).length,
      pending: week.isPending || items.isPending,
      all: items.data ?? [],
    }
  }, [items.data, items.isPending, week.data, week.isPending, monday])
}
