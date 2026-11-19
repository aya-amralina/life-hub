import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { write } from '@/app/offlineQueue'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesUpdate } from '@/lib/db/types'
import type { ISODate } from '@/lib/dates'

export type CoreProgram = Tables<'core_programs'>
export type CoreSession = Tables<'core_sessions'>
export type CoreTest = Tables<'core_tests'>

/** The session screen of «Кор» (Тело → Кор). */
export const CORE_PATH = '/body/core'

export const coreKeys = {
  program: ['core_programs'] as const,
  sessions: ['core_sessions'] as const,
  tests: ['core_tests'] as const,
}

/** The program «Кор» (one, seeded by migration 0020); null when there is none. */
export function useCoreProgram() {
  return useQuery({
    queryKey: coreKeys.program,
    queryFn: async (): Promise<CoreProgram | null> => {
      const { data, error } = await supabase.from('core_programs').select('*').order('created_at').limit(1).maybeSingle()
      if (error) throw error
      return data
    },
    staleTime: 10 * 60_000,
  })
}

/** All sessions (one a day — a few hundred a year): the day, the week, the next stage and the calendar from one cache. */
export function useCoreSessions() {
  return useQuery({
    queryKey: coreKeys.sessions,
    queryFn: async (): Promise<CoreSession[]> => {
      const { data, error } = await supabase.from('core_sessions').select('*').order('date')
      if (error) throw error
      return data
    },
  })
}

export function useCoreTests() {
  return useQuery({
    queryKey: coreKeys.tests,
    queryFn: async (): Promise<CoreTest[]> => {
      const { data, error } = await supabase.from('core_tests').select('*').order('date')
      if (error) throw error
      return data
    },
  })
}

type SessionPatch = Partial<Pick<CoreSession, 'done' | 'dome' | 'done_at'>>

/**
 * The session of a day: upsert by (program, date) with only the changed fields, through the offline queue.
 * Optimistic — a tick shows at once. The stage is the program's stage of the moment.
 */
export function useSaveCoreSession(program: Pick<CoreProgram, 'id' | 'stage'>, date: ISODate) {
  const qc = useQueryClient()
  return useMutation({
    networkMode: 'always',
    // ticks of one session go out one by one (each sends the whole `done` list — the last one must win)
    scope: { id: `core_sessions:${date}` },
    mutationKey: ['core_sessions', 'save', date],
    mutationFn: async (patch: SessionPatch) => {
      await write({
        table: 'core_sessions',
        action: 'upsert',
        values: { program_id: program.id, date, stage: program.stage, ...patch },
        onConflict: 'user_id,program_id,date',
      })
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: coreKeys.sessions })
      const prev = qc.getQueryData<CoreSession[]>(coreKeys.sessions)
      qc.setQueryData<CoreSession[]>(coreKeys.sessions, (old = []) => {
        const i = old.findIndex((s) => s.program_id === program.id && s.date === date)
        if (i >= 0) return old.map((s, j) => (j === i ? { ...s, ...patch } : s))
        const row = { id: `local-${date}`, program_id: program.id, date, stage: program.stage, done: [], dome: null, done_at: null, ...patch }
        return [...old, row as CoreSession].sort((a, b) => a.date.localeCompare(b.date))
      })
      return { prev }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(coreKeys.sessions, ctx?.prev),
    onSettled: () => (qc.isMutating({ mutationKey: ['core_sessions', 'save', date] }) <= 1 ? qc.invalidateQueries({ queryKey: coreKeys.sessions }) : undefined),
  })
}

/** «Перейти» / «Ещё неделю». */
export function useUpdateCoreProgram() {
  const qc = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'core_programs'> }) => {
      await write({ table: 'core_programs', action: 'update', id, values: patch as Record<string, unknown> })
    },
    onMutate: async ({ patch }) => {
      await qc.cancelQueries({ queryKey: coreKeys.program })
      const prev = qc.getQueryData<CoreProgram | null>(coreKeys.program)
      if (prev) qc.setQueryData<CoreProgram>(coreKeys.program, { ...prev, ...patch } as CoreProgram)
      return { prev }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(coreKeys.program, ctx?.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: coreKeys.program }),
  })
}

/** Тест пальцами of a day: upsert by (program, date). */
export function useSaveCoreTest(programId: string) {
  const qc = useQueryClient()
  return useMutation({
    networkMode: 'always',
    mutationFn: async (row: { date: ISODate; fingers: number | null; dome: boolean | null }) => {
      await write({ table: 'core_tests', action: 'upsert', values: { program_id: programId, ...row }, onConflict: 'user_id,program_id,date' })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: coreKeys.tests }),
  })
}
