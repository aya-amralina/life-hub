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
  | 'starts_on'
  | 'happens_on'
  | 'happens_time'
  | 'is_fixed'
  | 'rollover_count'
  | 'outcome'
  | 'source_id'
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

// List fields only: long texts (notes, links) are loaded on the item card. `outcome` is one line («что это дало»).
const LIST_FIELDS =
  'id, sphere, title, type, status, priority, area, due_date, due_time, ready_by, starts_on, happens_on, happens_time, is_fixed, rollover_count, week_id, hours_est, waiting_on, people, synergy, trap, data_status, next_step, outcome, source_id, done_at, sort_order, updated_at'

export type FullItem = Tables<'items'>

export const itemKeys = { all: ['items'] as const, one: (id: string) => ['items', 'one', id] as const }

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

/** The whole row for the item card (notes, links). */
export function useItem(id: string | undefined) {
  return useQuery({
    queryKey: itemKeys.one(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<FullItem | null> => {
      const { data, error } = await supabase.from('items').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Only own items (created in the app, source_id null) can be deleted; imported ones are closed instead. */
export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('items').delete().eq('id', id).is('source_id', null)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: itemKeys.all }),
  })
}

/** Several patches at once (rollover, moving a group of items). */
export async function patchItems(patches: readonly { id: string; patch: TablesUpdate<'items'> }[]) {
  for (const { id, patch } of patches) {
    const { error } = await supabase.from('items').update(patch).eq('id', id)
    if (error) throw error
  }
}

export function usePatchItems() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: patchItems,
    onSettled: () => qc.invalidateQueries({ queryKey: itemKeys.all }),
  })
}
