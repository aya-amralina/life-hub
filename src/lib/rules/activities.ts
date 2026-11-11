import { addDaysISO, type ISODate } from '../dates'

export type ActivityTypeLike = { id: string; points_per_10min: number }
export type ActivityLike = { date: ISODate; type_id: string; minutes: number | null }

const round1 = (n: number) => Math.round(n * 10) / 10

/** Rule 25: score = minutes / 10 × points per 10 minutes of the type. No minutes — no points. */
export function activityPoints(minutes: number | null, pointsPer10min: number): number {
  if (!minutes || minutes <= 0) return 0
  return round1((minutes / 10) * Number(pointsPer10min))
}

function pointsOf(a: ActivityLike, types: readonly ActivityTypeLike[]): number {
  const type = types.find((t) => t.id === a.type_id)
  return type ? activityPoints(a.minutes, type.points_per_10min) : 0
}

/** Score of one day (several activities a day). */
export function dayPoints(activities: readonly ActivityLike[], types: readonly ActivityTypeLike[], day: ISODate): number {
  return round1(activities.filter((a) => a.date === day).reduce((s, a) => s + pointsOf(a, types), 0))
}

/** Rule 25: score of the week Mon–Sun. */
export function weekPoints(activities: readonly ActivityLike[], types: readonly ActivityTypeLike[], monday: ISODate): number {
  const sunday = addDaysISO(monday, 6)
  return round1(activities.filter((a) => a.date >= monday && a.date <= sunday).reduce((s, a) => s + pointsOf(a, types), 0))
}

/** Week target of the stage (`targets.activity_points_week`), null if not set. */
export function weekPointsTarget(stage: { targets?: unknown } | null): number | null {
  const t = stage?.targets
  if (!t || typeof t !== 'object') return null
  const v = Number((t as Record<string, unknown>).activity_points_week)
  return Number.isFinite(v) && v > 0 ? v : null
}
