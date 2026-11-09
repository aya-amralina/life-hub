import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/lib/db/types'
import { weekStart, type ISODate } from '@/lib/dates'

export function useCurrentWeek(today: ISODate) {
  const monday = weekStart(today)
  return useQuery({
    queryKey: ['weeks', monday],
    queryFn: async (): Promise<Tables<'weeks'> | null> => {
      const { data, error } = await supabase.from('weeks').select('*').eq('start_date', monday).maybeSingle()
      if (error) throw error
      return data
    },
  })
}
