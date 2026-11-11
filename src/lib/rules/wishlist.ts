export const WISH_HOURS = 48

export type WishLike = { added_at: string; decision: string | null }

/** Hours left to think (rounded up), 0 when the 48 hours are over. */
export function wishHoursLeft(w: WishLike, now: Date): number {
  const ms = new Date(w.added_at).getTime() + WISH_HOURS * 3_600_000 - now.getTime()
  return ms <= 0 ? 0 : Math.ceil(ms / 3_600_000)
}

/** Rule 5: 48 hours without a decision → ask «всё ещё нужно?». */
export function wishDue(w: WishLike, now: Date): boolean {
  return w.decision === null && wishHoursLeft(w, now) === 0
}

/** Sum of the wishes decided «не покупать» — what thinking it over saved, in cents. */
export function wishSavedCents(list: readonly (WishLike & { price_eur: number | null })[]): number {
  return list.filter((w) => w.decision === 'skip').reduce((s, w) => s + Math.round(Number(w.price_eur ?? 0) * 100), 0)
}
