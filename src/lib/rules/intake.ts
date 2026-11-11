import type { ISODate } from '../dates'

export type IntakeLike = { start_date: ISODate; end_date: ISODate | null }

/** Rule 26: taking it now — started, and not finished yet (end_date empty or today and later). */
export function isIntakeActive(i: IntakeLike, today: ISODate): boolean {
  return i.start_date <= today && (i.end_date === null || i.end_date >= today)
}
