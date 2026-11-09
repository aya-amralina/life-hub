import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/lib/db/types'

export type Item = Tables<'items'>

const ITEM_FIELDS =
  'id, user_id, sphere, title, type, status, priority, area, due_date, due_time, ready_by, week_id, hours_est, waiting_on, people, links, synergy, trap, data_status, next_step, clickup, notes, outcome, done_at, sort_order, source_id, created_at, updated_at'

export const itemKeys = {
  all: ['items'] as const,
  today: () => [...itemKeys.all, 'today'] as const,
}

/** Open items + items closed in the last 36 h (enough to cover «today» in Berlin). */
export function useTodayItems() {
  return useQuery({
    queryKey: itemKeys.today(),
    queryFn: async (): Promise<Item[]> => {
      const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString()
      const { data, error } = await supabase
        .from('items')
        .select(ITEM_FIELDS)
        .or(`done_at.is.null,done_at.gte.${since}`)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(1000)
      if (error) throw error
      return data
    },
  })
}

export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: TablesInsert<'items'>) => {
      const { data, error } = await supabase.from('items').insert(item).select(ITEM_FIELDS).single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: itemKeys.all }),
  })
}

/** Check / uncheck an item. Optimistic: the checkbox flips instantly. */
export function useToggleItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from('items')
        .update({ done_at: done ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: itemKeys.today() })
      const prev = qc.getQueryData<Item[]>(itemKeys.today())
      qc.setQueryData<Item[]>(itemKeys.today(), (old) =>
        old?.map((i) => (i.id === id ? { ...i, done_at: done ? new Date().toISOString() : null } : i)),
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(itemKeys.today(), ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: itemKeys.all }),
  })
}
