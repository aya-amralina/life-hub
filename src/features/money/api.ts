import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/lib/db/types'
import { addDaysISO, type ISODate } from '@/lib/dates'
import type { WeekCategory } from '@/lib/constants'
import { ensureWeek, weekKeys } from '@/features/weeks/api'

export type Transaction = Tables<'transactions'>
export type WeekLimit = Tables<'week_limits'>

export const moneyKeys = {
  all: ['money'] as const,
  limits: (weekId: string | null) => ['money', 'limits', weekId] as const,
  week: (monday: ISODate) => ['money', 'tx', monday] as const,
}

export function useWeekLimits(weekId: string | null) {
  return useQuery({
    queryKey: moneyKeys.limits(weekId),
    enabled: weekId !== null,
    queryFn: async (): Promise<WeekLimit[]> => {
      const { data, error } = await supabase.from('week_limits').select('*').eq('week_id', weekId!)
      if (error) throw error
      return data
    },
  })
}

/** Transactions dated within the week (Mon–Sun). */
export function useWeekTransactions(monday: ISODate) {
  return useQuery({
    queryKey: moneyKeys.week(monday),
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('date', monday)
        .lte('date', addDaysISO(monday, 6))
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Quick expense: saved immediately as fact (group «Жизнь», no envelope). */
export function useAddExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (tx: Pick<TablesInsert<'transactions'>, 'date' | 'amount_eur' | 'category' | 'account' | 'title'>) => {
      const { data, error } = await supabase
        .from('transactions')
        .insert({ ...tx, kind: 'expense', grp: 'Жизнь', is_planned: false, confirmed_at: new Date().toISOString() })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSettled: () => qc.invalidateQueries({ queryKey: moneyKeys.all }),
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: moneyKeys.all }),
  })
}

/** Set the week's limits (creates the week row if needed). Amounts in cents. */
export function useSaveLimits() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ monday, limits }: { monday: ISODate; limits: Partial<Record<WeekCategory, number>> }) => {
      const week = await ensureWeek(monday)
      const rows = Object.entries(limits).map(([category, cents]) => ({
        week_id: week.id,
        category,
        limit_eur: (cents ?? 0) / 100,
      }))
      if (rows.length) {
        const { error } = await supabase.from('week_limits').upsert(rows, { onConflict: 'user_id,week_id,category' })
        if (error) throw error
      }
      return week
    },
    onSuccess: (week) => {
      qc.setQueryData(weekKeys.byStart(week.start_date), week)
      return qc.invalidateQueries({ queryKey: moneyKeys.all })
    },
  })
}
