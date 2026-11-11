import { describe, expect, it } from 'vitest'
import { activityPoints, dayPoints, weekPoints, weekPointsTarget } from './activities'

describe('rule 25: activity score', () => {
  it('minutes / 10 × points per 10 minutes', () => {
    expect(activityPoints(30, 2)).toBe(6)
    expect(activityPoints(45, 3)).toBe(13.5)
    expect(activityPoints(25, 1)).toBe(2.5)
  })
  it('no minutes — no points', () => {
    expect(activityPoints(null, 3)).toBe(0)
    expect(activityPoints(0, 3)).toBe(0)
  })

  const types = [
    { id: 'walk', points_per_10min: 1 },
    { id: 'gym', points_per_10min: 3 },
  ]
  const acts = [
    { date: '2026-11-09', type_id: 'walk', minutes: 40 },
    { date: '2026-11-09', type_id: 'gym', minutes: 30 },
    { date: '2026-11-15', type_id: 'gym', minutes: 20 },
    { date: '2026-11-16', type_id: 'gym', minutes: 60 }, // next week
    { date: '2026-11-10', type_id: 'deleted', minutes: 60 }, // unknown type scores 0
  ]
  it('several activities a day add up', () => expect(dayPoints(acts, types, '2026-11-09')).toBe(13))
  it('week sum Mon–Sun', () => expect(weekPoints(acts, types, '2026-11-09')).toBe(19))
  it('week target from the stage', () => {
    expect(weekPointsTarget({ targets: { activity_points_week: 60 } })).toBe(60)
    expect(weekPointsTarget({ targets: {} })).toBeNull()
    expect(weekPointsTarget(null)).toBeNull()
  })
})
