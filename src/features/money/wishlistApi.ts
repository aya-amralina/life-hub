import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { write } from '@/app/offlineQueue'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/db/types'

export type Wish = Tables<'wishlist'>
const key = ['wishlist'] as const

export function useWishlist() {
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<Wish[]> => {
      const { data, error } = await supabase.from('wishlist').select('*').order('added_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useAddWish() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (w: TablesInsert<'wishlist'>) => {
      await write({ table: 'wishlist', action: 'insert', values: { id: crypto.randomUUID(), added_at: new Date().toISOString(), ...w } })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

/** Decide / undo. Optimistic: the question disappears at once. */
export function useUpdateWish() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'wishlist'> }) => {
      await write({ table: 'wishlist', action: 'update', id, values: patch })
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Wish[]>(key)
      qc.setQueryData<Wish[]>(key, (old) => old?.map((w) => (w.id === id ? { ...w, ...patch } : w)))
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}
