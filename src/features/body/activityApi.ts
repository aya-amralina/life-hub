import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/db/types'

export type ActivityType = Tables<'activity_types'>
export type Activity = Tables<'activities'>
export type Intake = Tables<'intake'>
export type StrengthSet = Tables<'strength_sets'>
export type Measurement = Tables<'measurements'>

export const bodyDataKeys = {
  types: ['activity_types'] as const,
  activities: ['activities'] as const,
  intake: ['intake'] as const,
  strength: ['strength_sets'] as const,
  measurements: ['measurements'] as const,
  stages: ['plan_stages'] as const,
}

function useList<T>(key: readonly string[], table: 'activity_types' | 'activities' | 'intake' | 'strength_sets' | 'measurements', order: string, ascending = true) {
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await supabase.from(table).select('*').order(order, { ascending }).limit(5000)
      if (error) throw error
      return data as T[]
    },
  })
}

export const useActivityTypes = () => useList<ActivityType>(bodyDataKeys.types, 'activity_types', 'sort_order')
/** All activities (several a day, a few hundred a semester): day, week and charts derive from one cache. */
export const useActivities = () => useList<Activity>(bodyDataKeys.activities, 'activities', 'date')
export const useIntake = () => useList<Intake>(bodyDataKeys.intake, 'intake', 'start_date', false)
export const useStrengthSets = () => useList<StrengthSet>(bodyDataKeys.strength, 'strength_sets', 'date', false)
export const useMeasurements = () => useList<Measurement>(bodyDataKeys.measurements, 'measurements', 'date', false)

// One generic writer for the small body tables; the cast only narrows the client's table typing.
type Writable = 'activity_types' | 'activities' | 'intake' | 'strength_sets' | 'measurements' | 'plan_stages'

/** Insert, update (with id) or delete a row; refetches the table's cache. */
export function useWrite<T extends Writable>(table: T, key: readonly string[]) {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: key })
  return {
    insert: useMutation({
      mutationFn: async (row: TablesInsert<T>) => {
        const { error } = await supabase.from(table as 'activities').insert(row as never)
        if (error) throw error
      },
      onSettled: done,
    }),
    update: useMutation({
      mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<T> }) => {
        const { error } = await supabase.from(table as 'activities').update(patch as never).eq('id', id)
        if (error) throw error
      },
      onSettled: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from(table as 'activities').delete().eq('id', id)
        if (error) throw error
      },
      onSettled: done,
    }),
  }
}
