import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/db/types'

export type Item = Pick<
  Tables<'items'>,
  | 'id'
  | 'sphere'
  | 'title'
  | 'type'
  | 'status'
  | 'priority'
  | 'area'
  | 'due_date'
  | 'due_time'
  | 'ready_by'
  | 'week_id'
  | 'hours_est'
  | 'waiting_on'
  | 'people'
  | 'synergy'
  | 'trap'
  | 'data_status'
  | 'next_step'
  | 'done_at'
  | 'sort_order'
  | 'updated_at'
>

// List fields only: long texts (notes, outcome, links) are loaded on the item card.
const LIST_FIELDS =
  'id, sphere, title, type, status, priority, area, due_date, due_time, ready_by, week_id, hours_est, waiting_on, people, synergy, trap, data_status, next_step, done_at, sort_order, updated_at'

export const itemKeys = { all: ['items'] as const }

/** All items (a few hundred at most) — every sphere screen derives its view from this one cache. */
export function useItems() {
  return useQuery({
    queryKey: itemKeys.all,
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase
        .from('items')
        .select(LIST_FIELDS)
        .order('sort_order')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(5000)
      if (error) throw error
      return data
    },
  })
}

export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: TablesInsert<'items'>) => {
      const { data, error } = await supabase.from('items').insert(item).select(LIST_FIELDS).single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => qc.setQueryData<Item[]>(itemKeys.all, (old) => (old ? [...old, row] : [row])),
    onSettled: () => qc.invalidateQueries({ queryKey: itemKeys.all }),
  })
}

/** Patch an item. Optimistic: the list updates instantly, rolls back on error. */
export function useUpdateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'items'> }) => {
      const { error } = await supabase.from('items').update(patch).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: itemKeys.all })
      const prev = qc.getQueryData<Item[]>(itemKeys.all)
      qc.setQueryData<Item[]>(itemKeys.all, (old) =>
        old?.map((i) => (i.id === id ? ({ ...i, ...patch, updated_at: new Date().toISOString() } as Item) : i)),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(itemKeys.all, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: itemKeys.all }),
  })
}

/** Check / uncheck. */
export function useToggleItem() {
  const update = useUpdateItem()
  return {
    ...update,
    mutate: ({ id, done }: { id: string; done: boolean }) =>
      update.mutate({ id, patch: { done_at: done ? new Date().toISOString() : null } }),
  }
}
