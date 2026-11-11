import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/lib/db/types'

export type Person = Tables<'people'>

const peopleKey = ['people'] as const

export function usePeople() {
  return useQuery({
    queryKey: peopleKey,
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase.from('people').select('*').order('name')
      if (error) throw error
      return data
    },
  })
}

export function useAddPerson() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: TablesInsert<'people'>) => {
      const { error } = await supabase.from('people').insert(p)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: peopleKey }),
  })
}
