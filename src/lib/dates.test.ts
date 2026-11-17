import { describe, expect, it } from 'vitest'
import {
  addDaysISO,
  addMonthsISO,
  endOfMonthISO,
  formatDayMonth,
  formatLongDate,
  formatRelativeDay,
  formatTimeBerlin,
  hourBerlin,
  todayBerlin,
  weekEnd,
  weekStart,
  weekdayShort,
} from './dates'

describe('todayBerlin', () => {
  it('uses Berlin date, not UTC', () => {
    // 23:30 UTC on 9 Nov = 00:30 on 10 Nov in Berlin (CET, UTC+1)
    expect(todayBerlin(new Date('2026-11-09T23:30:00Z'))).toBe('2026-11-10')
    expect(todayBerlin(new Date('2026-11-09T22:59:00Z'))).toBe('2026-11-09')
  })
  it('handles summer time', () => {
    // CEST, UTC+2
    expect(todayBerlin(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02')
  })
  it('hourBerlin', () => {
    expect(hourBerlin(new Date('2026-11-09T17:05:00Z'))).toBe(18)
  })
})

describe('weeks are Mon–Sun', () => {
  it('weekStart', () => {
    expect(weekStart('2026-10-13')).toBe('2026-10-12') // Tue → Mon
    expect(weekStart('2026-10-12')).toBe('2026-10-12')
    expect(weekStart('2026-10-18')).toBe('2026-10-12') // Sun belongs to the previous Monday
  })
  it('weekEnd', () => {
    expect(weekEnd('2026-10-13')).toBe('2026-10-18')
  })
  it('crosses the year', () => {
    expect(weekStart('2027-01-03')).toBe('2026-12-28')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('formats', () => {
  it('weekday', () => {
    expect(weekdayShort('2026-11-09')).toBe('Пн')
    expect(weekdayShort('2026-11-15')).toBe('Вс')
  })
  it('day.month', () => {
    expect(formatDayMonth('2026-12-10')).toBe('10.12')
    expect(formatDayMonth('2026-11-07')).toBe('7.11')
  })
  it('long date', () => {
    expect(formatLongDate('2026-11-09')).toBe('9 ноября')
  })
  it('relative day', () => {
    const today = '2026-11-09'
    expect(formatRelativeDay('2026-11-09', today)).toBe('сегодня')
    expect(formatRelativeDay('2026-11-10', today)).toBe('завтра')
    expect(formatRelativeDay('2026-11-08', today)).toBe('вчера')
    expect(formatRelativeDay('2026-11-12', today)).toBe('чт, 12.11')
  })
})

describe('formatTimeBerlin', () => {
  it('formats in Berlin time', () => {
    expect(formatTimeBerlin('2026-11-09T17:40:00Z')).toBe('18:40')
  })
})

describe('months', () => {
  it('end of month: 30/31 days, February in common and leap years', () => {
    expect(endOfMonthISO('2026-11-16')).toBe('2026-11-30')
    expect(endOfMonthISO('2026-12-01')).toBe('2026-12-31')
    expect(endOfMonthISO('2027-02-10')).toBe('2027-02-28')
    expect(endOfMonthISO('2028-02-10')).toBe('2028-02-29')
  })
  it('add months: across the year, a missing day becomes the last one', () => {
    expect(addMonthsISO('2026-11-16', 6)).toBe('2027-05-16')
    expect(addMonthsISO('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonthsISO('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonthsISO('2026-12-31', -1)).toBe('2026-11-30')
  })
})
