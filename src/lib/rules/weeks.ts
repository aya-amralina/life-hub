export type WeekLabels = {
  budget_week_no: number | null
  study_week: string | null
  glowup_week_no: number | null
  place_mode: string | null
}

/** «Неделя 5 бюджета · Н04 учёба · неделя 1 глоу-апа · у сестры» — only the parts that exist. */
export function weekLine(week: WeekLabels | null | undefined): string {
  if (!week) return ''
  const parts: string[] = []
  if (week.budget_week_no) parts.push(`Неделя ${week.budget_week_no} бюджета`)
  if (week.study_week) parts.push(`${week.study_week} учёба`)
  if (week.glowup_week_no) parts.push(`${parts.length ? 'неделя' : 'Неделя'} ${week.glowup_week_no} глоу-апа`)
  if (week.place_mode?.trim()) parts.push(week.place_mode.trim())
  return parts.join(' · ')
}
