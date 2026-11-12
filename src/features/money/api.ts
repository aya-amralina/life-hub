import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { write } from '@/app/offlineQueue'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/db/types'
import { addDaysISO, weekStart, type ISODate } from '@/lib/dates'
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
    // the id is made here, so «Отменить» works even before the expense reaches the server (offline queue)
    mutationFn: async (tx: Pick<TablesInsert<'transactions'>, 'date' | 'amount_eur' | 'category' | 'account' | 'title'> & { id: string }) => {
      const values = { ...tx, kind: 'expense', grp: 'Жизнь', is_planned: false, confirmed_at: new Date().toISOString() }
      await write({ table: 'transactions', action: 'insert', values })
      return values
    },
    onMutate: async (tx) => {
      // show it in the week at once (offline the refetch waits for the network)
      await qc.cancelQueries({ queryKey: moneyKeys.all })
      const monday = weekStart(tx.date)
      const row = { envelope_id: null, note: null, source_id: null, cancelled_at: null, entry_kind: 'one_off', week_no: null, debt_id: null, user_id: '', created_at: '', updated_at: '', ...tx, kind: 'expense', grp: 'Жизнь', is_planned: false, confirmed_at: new Date().toISOString() } as Transaction
      qc.setQueryData<Transaction[]>(moneyKeys.week(monday), (old) => (old ? [row, ...old] : [row]))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: moneyKeys.all }),
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await write({ table: 'transactions', action: 'delete', id })
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: moneyKeys.all })
      for (const [key, data] of qc.getQueriesData<Transaction[]>({ queryKey: moneyKeys.all })) {
        if (Array.isArray(data) && data.some((t) => t && typeof t === 'object' && 'amount_eur' in t)) qc.setQueryData(key, data.filter((t) => t.id !== id))
      }
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
      void qc.invalidateQueries({ queryKey: weekKeys.all })
      return qc.invalidateQueries({ queryKey: moneyKeys.all })
    },
  })
}

export type Envelope = Tables<'envelopes'>

/** All operations (a few hundred): balance, forecast, months, questions. */
export function useAllTransactions() {
  return useQuery({
    queryKey: [...moneyKeys.all, 'tx', 'all'] as const,
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase.from('transactions').select('*').order('date').order('created_at').limit(5000)
      if (error) throw error
      return data
    },
  })
}

/** Patch an operation (confirm, another date, cancel). Optimistic in every money cache. */
export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'transactions'> }) => {
      await write({ table: 'transactions', action: 'update', id, values: patch })
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: moneyKeys.all })
      const prev = qc.getQueriesData<Transaction[]>({ queryKey: moneyKeys.all })
      for (const [key, data] of prev) {
        if (Array.isArray(data) && data.some((t) => t && typeof t === 'object' && 'amount_eur' in t)) {
          qc.setQueryData<Transaction[]>(key, data.map((t) => (t.id === id ? { ...t, ...patch } : t)))
        }
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => qc.invalidateQueries({ queryKey: moneyKeys.all }),
  })
}

export function useEnvelopes() {
  return useQuery({
    queryKey: [...moneyKeys.all, 'envelopes'] as const,
    queryFn: async (): Promise<Envelope[]> => {
      const { data, error } = await supabase.from('envelopes').select('*').eq('archived', false).order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function useCreateEnvelope() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (e: TablesInsert<'envelopes'>) => {
      const { error } = await supabase.from('envelopes').insert(e)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: moneyKeys.all }),
  })
}

/** Limits of any week by its row id (next week's cut, rule 3). */
export async function fetchWeekLimits(weekId: string): Promise<WeekLimit[]> {
  const { data, error } = await supabase.from('week_limits').select('*').eq('week_id', weekId)
  if (error) throw error
  return data
}

export type Debt = Tables<'debts'>
export type ActualBalance = Tables<'actual_balances'>

export function useDebts() {
  return useQuery({
    queryKey: [...moneyKeys.all, 'debts'] as const,
    queryFn: async (): Promise<Debt[]> => {
      const { data, error } = await supabase.from('debts').select('*').order('created_at')
      if (error) throw error
      return data
    },
  })
}

/** «Остатки»: real balances — the one source for the reconciliation and for goals. */
export function useActualBalances() {
  return useQuery({
    queryKey: [...moneyKeys.all, 'actual_balances'] as const,
    queryFn: async (): Promise<ActualBalance[]> => {
      const { data, error } = await supabase.from('actual_balances').select('*').order('date', { ascending: false }).limit(2000)
      if (error) throw error
      return data
    },
  })
}

/** The Sunday review writes the balances it asks for into «Остатки» (one row per day and account). */
export function useSaveActualBalances() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ date, balances }: { date: ISODate; balances: Record<string, number> }) => {
      const rows = Object.entries(balances).map(([account, amount]) => ({ date, account, amount_eur: amount, origin: 'review' }))
      if (!rows.length) return
      const { error } = await supabase.from('actual_balances').upsert(rows, { onConflict: 'user_id,date,account' })
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: moneyKeys.all }),
  })
}
