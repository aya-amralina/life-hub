import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/lib/db/types'
import type { ISODate } from '@/lib/dates'

export type Week = Tables<'weeks'>

export const weekKeys = { byStart: (monday: ISODate) => ['weeks', monday] as const }

/** The week row for a Monday (null before import / manual setup). */
export function useWeek(monday: ISODate) {
  return useQuery({
    queryKey: weekKeys.byStart(monday),
    queryFn: async (): Promise<Week | null> => {
      const { data, error } = await supabase.from('weeks').select('*').eq('start_date', monday).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Get or create the week row for a Monday. */
export async function ensureWeek(monday: ISODate): Promise<Week> {
  const { data, error } = await supabase
    .from('weeks')
    .upsert({ start_date: monday }, { onConflict: 'user_id,start_date', ignoreDuplicates: false })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export function useInvalidateWeek() {
  const qc = useQueryClient()
  return (monday: ISODate) => qc.invalidateQueries({ queryKey: weekKeys.byStart(monday) })
}

export function useEnsureWeek() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ensureWeek,
    onSuccess: (week) => qc.setQueryData(weekKeys.byStart(week.start_date), week),
  })
}
