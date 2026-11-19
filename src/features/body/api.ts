import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { write } from '@/app/offlineQueue'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/lib/db/types'
import { addDaysISO, type ISODate } from '@/lib/dates'

export type DailyLog = Tables<'daily_logs'>
export type Stage = Tables<'plan_stages'>
export type DailyPatch = Omit<TablesInsert<'daily_logs'>, 'date' | 'user_id' | 'id'>

export const bodyKeys = {
  day: (date: ISODate) => ['daily_logs', 'day', date] as const,
  week: (monday: ISODate) => ['daily_logs', 'week', monday] as const,
  stages: ['plan_stages'] as const,
}

export function useDailyLog(date: ISODate) {
  return useQuery({
    queryKey: bodyKeys.day(date),
    queryFn: async (): Promise<DailyLog | null> => {
      const { data, error } = await supabase.from('daily_logs').select('*').eq('date', date).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useWeekLogs(monday: ISODate) {
  return useQuery({
    queryKey: bodyKeys.week(monday),
    queryFn: async (): Promise<DailyLog[]> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .gte('date', monday)
        .lte('date', addDaysISO(monday, 6))
      if (error) throw error
      return data
    },
  })
}

export function useStages() {
  return useQuery({
    queryKey: bodyKeys.stages,
    queryFn: async (): Promise<Stage[]> => {
      const { data, error } = await supabase.from('plan_stages').select('*').order('start_date')
      if (error) throw error
      return data
    },
    staleTime: 10 * 60_000,
  })
}

/**
 * Autosave one or more fields of a day (upsert by user+date; only the sent columns change).
 * Optimistic: the day cache updates instantly.
 */
export function useSaveDailyLog(date: ISODate) {
  const qc = useQueryClient()
  return useMutation({
    // one day's changes go out one by one: two quick taps (1 → 2 cups) never reach the server in reverse order
    scope: { id: `daily_logs:${date}` },
    mutationKey: ['daily_logs', 'save', date],
    // offline: queued and sent when the network is back
    mutationFn: async (patch: DailyPatch) => {
      await write({ table: 'daily_logs', action: 'upsert', values: { date, ...patch }, onConflict: 'user_id,date' })
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: bodyKeys.day(date) })
      const prev = qc.getQueryData<DailyLog | null>(bodyKeys.day(date))
      qc.setQueryData<DailyLog | null>(bodyKeys.day(date), (old) => ({ ...emptyLog(date), ...old, ...patch }) as DailyLog)
      return { prev }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(bodyKeys.day(date), ctx?.prev ?? null),
    // refetch after the last change of the queue only — an earlier answer must not flash the older value
    onSettled: () => (qc.isMutating({ mutationKey: ['daily_logs', 'save', date] }) <= 1 ? qc.invalidateQueries({ queryKey: ['daily_logs'] }) : undefined),
  })
}

function emptyLog(date: ISODate): Partial<DailyLog> {
  return {
    date,
    morning: false,
    outside: false,
    water: false,
    body_cream: false,
    care: [],
    minimum_mode: false,
    face_evening: null,
    energy: null,
    slump: null,
    sleep_h: null,
    coffee_cups: null,
    mood: null,
    note: null,
  }
}

/** Daily logs from a date on (charts: up to 6 months, a few hundred rows). */
export function useLogsSince(from: ISODate) {
  return useQuery({
    queryKey: ['daily_logs', 'since', from] as const,
    queryFn: async (): Promise<DailyLog[]> => {
      const { data, error } = await supabase.from('daily_logs').select('*').gte('date', from).order('date')
      if (error) throw error
      return data
    },
  })
}
