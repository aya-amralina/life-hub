/** Care checklist of «Отметка дня» when the stage has none (stage 1 default, before import). */
export const DEFAULT_CARE: readonly string[] = ['Крем для тела', 'Ниацинамид утром']

/** Care items of the day come from the glow-up stage, like habits — products change without code changes. */
export function careItems(stage: { care_items?: string[] | null } | null): string[] {
  const list = (stage?.care_items ?? []).map((s) => s.trim()).filter(Boolean)
  return list.length ? [...new Set(list)] : [...DEFAULT_CARE]
}

/** Marked care items of the day that are still on the list, and how many of the list are marked. */
export function careDone(marked: readonly string[] | null | undefined, items: readonly string[]): number {
  return items.filter((i) => (marked ?? []).includes(i)).length
}

/** Toggle one care item in the day's marks. */
export function toggleCare(marked: readonly string[] | null | undefined, item: string): string[] {
  const list = marked ?? []
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}
