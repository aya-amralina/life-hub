import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { todayBerlin, weekStart } from '@/lib/dates'
import { planRollover, rolloverCandidates, weekCapacity } from '@/lib/rules/study'
import { itemKeys, patchItems, useItems } from '@/features/items/api'
import { ensureWeek, useAllWeeks, weekKeys } from '@/features/weeks/api'

/**
 * Rule 20 on the client, no server cron: when the app opens in a new week, open flexible study items of
 * past weeks move into this week as far as its maximum allows. Idempotent — the plan is computed from the
 * data, so a second device or a second run plans nothing new. The rest is «Ждут решения» (rule 21).
 */
export function useRollover() {
  const items = useItems()
  const weeks = useAllWeeks()
  const qc = useQueryClient()
  const ranFor = useRef<string | null>(null)

  useEffect(() => {
    if (!items.data || !weeks.data) return
    const monday = weekStart(todayBerlin())
    if (ranFor.current === monday) return
    ranFor.current = monday
    if (!rolloverCandidates(items.data, weeks.data, monday).length) return
    const list = items.data
    const known = weeks.data
    void (async () => {
      const week = known.find((w) => w.start_date === monday) ?? (await ensureWeek(monday))
      const plan = planRollover(list, [...known, week], { monday, weekId: week.id, capacity: weekCapacity(week) })
      if (plan.moves.length) {
        await patchItems(plan.moves.map((m) => ({ id: m.item.id, patch: { week_id: week.id, rollover_count: m.rollover_count } })))
      }
      // every week cache: the current week row may have just been created
      await Promise.all([qc.invalidateQueries({ queryKey: itemKeys.all }), qc.invalidateQueries({ queryKey: weekKeys.prefix })])
    })().catch(() => {
      ranFor.current = null // try again on the next data refresh
    })
  }, [items.data, weeks.data, qc])
}
