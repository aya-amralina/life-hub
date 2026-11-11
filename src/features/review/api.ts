import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Json, Tables } from '@/lib/db/types'

export type Review = Tables<'reviews'>
export type ReviewPatch = { answers?: Json; balances?: Json; impulse_note?: string | null; week_thought?: string | null; completed_at?: string | null }

const key = (weekId: string | null) => ['reviews', weekId] as const

export function useReview(weekId: string | null) {
  return useQuery({
    queryKey: key(weekId),
    enabled: weekId !== null,
    queryFn: async (): Promise<Review | null> => {
      const { data, error } = await supabase.from('reviews').select('*').eq('week_id', weekId!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Autosave of the review: one row per week (upsert by user + week). */
export function useSaveReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ weekId, patch }: { weekId: string; patch: ReviewPatch }) => {
      const { error } = await supabase.from('reviews').upsert({ week_id: weekId, ...patch }, { onConflict: 'user_id,week_id' })
      if (error) throw error
    },
    onSettled: (_d, _e, v) => qc.invalidateQueries({ queryKey: key(v.weekId) }),
  })
}
