import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { JournalLog, JournalWeek } from '@/lib/rules/journal'

/**
 * The journal: days with a note (and their mood / energy / sleep) and «Мысль на неделю» of the reviews.
 * Keyed under 'daily_logs', so saving a note (useSaveDailyLog) refreshes it.
 */
export function useJournal() {
  return useQuery({
    queryKey: ['daily_logs', 'journal'] as const,
    queryFn: async (): Promise<{ logs: JournalLog[]; weeks: JournalWeek[] }> => {
      const [logs, reviews] = await Promise.all([
        supabase.from('daily_logs').select('date, note, mood, energy, sleep_h').not('note', 'is', null).order('date', { ascending: false }).limit(2000),
        supabase.from('reviews').select('week_thought, week:weeks(start_date)').not('week_thought', 'is', null).limit(500),
      ])
      if (logs.error) throw logs.error
      if (reviews.error) throw reviews.error
      return {
        logs: logs.data,
        weeks: reviews.data.flatMap((r) => (r.week ? [{ start_date: r.week.start_date, week_thought: r.week_thought }] : [])),
      }
    },
  })
}
