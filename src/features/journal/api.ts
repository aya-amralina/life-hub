import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllPages } from '@/lib/paging'
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
        // paged past max_rows (1000 notes ≈ 3 years); reviews are one a week — 500 is ten years
        fetchAllPages((from, to) =>
          supabase.from('daily_logs').select('id, date, note, mood, energy, sleep_h').not('note', 'is', null).order('date', { ascending: false }).order('id').range(from, to),
        ),
        supabase.from('reviews').select('week_thought, week:weeks(start_date)').not('week_thought', 'is', null).limit(500),
      ])
      if (reviews.error) throw reviews.error
      return {
        logs,
        weeks: reviews.data.flatMap((r) => (r.week ? [{ start_date: r.week.start_date, week_thought: r.week_thought }] : [])),
      }
    },
  })
}
