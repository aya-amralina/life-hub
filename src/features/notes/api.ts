import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/lib/db/types'
import type { Sphere } from '@/lib/constants'

export type Note = Tables<'notes'>

export const noteKeys = { sphere: (s: Sphere) => ['notes', s] as const }

export function useNotes(sphere: Sphere) {
  return useQuery({
    queryKey: noteKeys.sphere(sphere),
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('sphere', sphere)
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (note: TablesInsert<'notes'>) => {
      const { error } = await supabase.from('notes').insert(note)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}
