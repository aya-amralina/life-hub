import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/lib/db/types'

export type ItemSeries = Tables<'item_series'>

/** Series of items (repeats and chains of steps — migration 0024): a handful of rows. */
export function useItemSeries() {
  return useQuery({
    queryKey: ['item_series'] as const,
    queryFn: async (): Promise<ItemSeries[]> => {
      const { data, error } = await supabase.from('item_series').select('*').order('sort_order')
      if (error) throw error
      return data
    },
    staleTime: 10 * 60_000,
  })
}
