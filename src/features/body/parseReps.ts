/** «10 10 8» → [10, 10, 8]; null if anything is not a number. */
export function parseReps(input: string): number[] | null {
  const parts = input.trim().split(/[\s,;·/]+/).filter(Boolean)
  if (!parts.length) return null
  const reps = parts.map(Number)
  return reps.every((n) => Number.isInteger(n) && n > 0 && n < 1000) ? reps : null
}
