import { describe, expect, it } from 'vitest'
import { weekLine } from './weeks'

describe('weekLine', () => {
  it('joins all parts', () => {
    expect(
      weekLine({ budget_week_no: 5, study_week: 'Н04', glowup_week_no: 1, place_mode: 'у сестры' }),
    ).toBe('Неделя 5 бюджета · Н04 учёба · неделя 1 глоу-апа · у сестры')
  })
  it('skips missing parts and capitalises the first', () => {
    expect(weekLine({ budget_week_no: null, study_week: null, glowup_week_no: 3, place_mode: ' ' })).toBe(
      'Неделя 3 глоу-апа',
    )
  })
  it('empty for no week', () => {
    expect(weekLine(null)).toBe('')
  })
})
