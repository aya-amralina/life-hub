import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { write } from '@/app/offlineQueue'
import { supabase } from '@/lib/supabase'
import { fetchAllPages } from '@/lib/paging'
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/db/types'
import type { ISODate } from '@/lib/dates'
import { dayMarks } from '@/lib/rules/habits'

export type Habit = Tables<'habits'>
export type HabitPlan = Tables<'habit_plan'>
export type HabitMark = Tables<'habit_marks'>
export type WorkoutTemplate = Tables<'workout_templates'>
export type WorkoutQueue = Tables<'workout_queue'>

export const habitKeys = {
  list: ['habits'] as const,
  marks: ['habit_marks'] as const,
  range: (from: ISODate, to: ISODate) => ['habit_marks', from, to] as const,
  workouts: ['workout_templates'] as const,
}

/** All habits (archived too — the past counts them) with their plan: a few dozen rows, one cache. */
export function useHabits() {
  return useQuery({
    queryKey: habitKeys.list,
    queryFn: async (): Promise<{ habits: Habit[]; plans: HabitPlan[] }> => {
      const [h, p] = await Promise.all([supabase.from('habits').select('*').order('sort_order'), supabase.from('habit_plan').select('*')])
      if (h.error) throw h.error
      if (p.error) throw p.error
      return { habits: h.data, plans: p.data }
    },
    staleTime: 10 * 60_000,
  })
}

/** Marks of days from … to (inclusive). A day is one range (from = to); charts take 13 weeks (≈ 500 rows). */
export function useMarks(from: ISODate, to: ISODate) {
  return useQuery({
    queryKey: habitKeys.range(from, to),
    queryFn: () =>
      fetchAllPages((a, b) => supabase.from('habit_marks').select('*').gte('date', from).lte('date', to).order('date').order('id').range(a, b)) as Promise<HabitMark[]>,
  })
}

type MarkPatch = { habit_id: string; done: boolean }

/**
 * Mark / unmark habits of a day: an upsert per habit (done true / false) through the offline queue, in order (one scope
 * per day), optimistic in every cached range holding the day. A rejection rolls back (the toast is app-wide).
 */
export function useSetMarks(date: ISODate) {
  const qc = useQueryClient()
  const inRange = (key: readonly unknown[]) => key.length === 3 && (key[1] as string) <= date && date <= (key[2] as string)
  return useMutation({
    scope: { id: `habit_marks:${date}` },
    mutationKey: ['habit_marks', 'save', date],
    mutationFn: async (patches: readonly MarkPatch[]) => {
      for (const p of patches) await write({ table: 'habit_marks', action: 'upsert', values: { date, ...p }, onConflict: 'user_id,habit_id,date' })
    },
    onMutate: async (patches) => {
      await qc.cancelQueries({ queryKey: habitKeys.marks })
      const prev = qc.getQueriesData<HabitMark[]>({ queryKey: habitKeys.marks })
      for (const [key, rows] of prev) {
        if (!rows || !inRange(key)) continue
        let next = rows
        for (const p of patches) {
          const i = next.findIndex((m) => m.habit_id === p.habit_id && m.date === date)
          next = i >= 0 ? next.map((m, j) => (j === i ? { ...m, done: p.done } : m)) : [...next, { id: `local-${p.habit_id}-${date}`, date, ...p } as HabitMark]
        }
        qc.setQueryData(key, next)
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev.forEach(([key, rows]) => qc.setQueryData(key, rows)),
    onSettled: () => (qc.isMutating({ mutationKey: ['habit_marks', 'save', date] }) <= 1 ? qc.invalidateQueries({ queryKey: habitKeys.marks }) : undefined),
  })
}

export type HabitStep =
  | { action: 'insert'; habit: TablesInsert<'habits'> & { id: string }; from_date: ISODate | null }
  | { action: 'update'; id: string; patch: TablesUpdate<'habits'> }

/** Settings: add a habit (with its plan period) or change one (minimum, archive) — in order, through the queue. */
export function useSaveHabits() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (steps: readonly HabitStep[]) => {
      for (const s of steps) {
        if (s.action === 'update') {
          await write({ table: 'habits', action: 'update', id: s.id, values: s.patch as Record<string, unknown> })
          continue
        }
        await write({ table: 'habits', action: 'insert', values: s.habit as Record<string, unknown> })
        await write({ table: 'habit_plan', action: 'insert', values: { id: crypto.randomUUID(), habit_id: s.habit.id, from_date: s.from_date } })
      }
    },
    onMutate: async (steps) => {
      await qc.cancelQueries({ queryKey: habitKeys.list })
      const prev = qc.getQueryData<{ habits: Habit[]; plans: HabitPlan[] }>(habitKeys.list)
      if (prev) {
        let { habits, plans } = prev
        for (const s of steps) {
          if (s.action === 'update') habits = habits.map((h) => (h.id === s.id ? ({ ...h, ...s.patch } as Habit) : h))
          else {
            habits = [...habits, { archived_at: null, in_minimum: false, sort_order: 0, group_name: null, ...s.habit } as Habit]
            plans = [...plans, { id: `local-${s.habit.id}`, habit_id: s.habit.id, from_date: s.from_date, to_date: null } as HabitPlan]
          }
        }
        qc.setQueryData(habitKeys.list, { habits, plans })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(habitKeys.list, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: habitKeys.list }),
  })
}

/** Strength templates and the queue (two small tables). */
export function useWorkouts() {
  return useQuery({
    queryKey: habitKeys.workouts,
    queryFn: async (): Promise<{ templates: WorkoutTemplate[]; queue: WorkoutQueue[] }> => {
      const [t, q] = await Promise.all([supabase.from('workout_templates').select('*').order('sort_order'), supabase.from('workout_queue').select('*').order('starts_on').order('position')])
      if (t.error) throw t.error
      if (q.error) throw q.error
      return { templates: t.data, queue: q.data }
    },
    staleTime: 10 * 60_000,
  })
}

/** One day of habits: the list with its plan, the day's marks and «минимум» — everything a day card counts from. */
export function useHabitDay(date: ISODate, minimumMode: boolean) {
  const habits = useHabits()
  const marks = useMarks(date, date)
  const data = habits.data ?? { habits: [], plans: [] }
  return {
    isPending: habits.isPending || marks.isPending,
    habits: data.habits,
    plans: data.plans,
    day: dayMarks(marks.data ?? [], date, minimumMode),
  }
}
