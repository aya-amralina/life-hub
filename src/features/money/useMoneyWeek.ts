import { useMemo } from 'react'
import type { ISODate } from '@/lib/dates'
import { moneyWeek } from '@/lib/rules/money'
import { useWeek } from '@/features/weeks/api'
import { useWeekLimits, useWeekTransactions } from './api'

/** Week row + limits + transactions → rule 2. */
export function useMoneyWeek(monday: ISODate) {
  const week = useWeek(monday)
  const limits = useWeekLimits(week.data?.id ?? null)
  const txs = useWeekTransactions(monday)
  const pending = week.isPending || txs.isPending || (week.data != null && limits.isPending)
  const summary = useMemo(
    () => moneyWeek(limits.data ?? [], txs.data ?? [], monday),
    [limits.data, txs.data, monday],
  )
  return { week: week.data ?? null, txs: txs.data ?? [], summary, pending, error: week.error ?? txs.error ?? limits.error }
}
