import { addDaysISO, formatDayMonth, type ISODate } from '@/lib/dates'
import type { Week } from '@/features/weeks/api'

/** «Н05» from the week row, else the date range; with `range` both: «Н05 · 16.11 — 22.11». */
export function weekLabel(monday: ISODate, weeks: readonly Week[], range = false): string {
  const dates = `${formatDayMonth(monday)} — ${formatDayMonth(addDaysISO(monday, 6))}`
  const no = weeks.find((w) => w.start_date === monday)?.study_week
  if (!no) return dates
  return range ? `${no} · ${dates}` : no
}
