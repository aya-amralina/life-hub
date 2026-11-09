// Hand-written to match `supabase gen types` output until the project is linked.
// Regenerate with `npm run db:types` after every migration.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Owned = {
  id: string
  user_id: string
  source_id: string | null
  created_at: string
  updated_at: string
}

type WeekRow = Owned & {
  start_date: string
  end_date: string
  place_mode: string | null
  events: string | null
  budget_week_no: number | null
  study_week: string | null
  glowup_week_no: number | null
  capacity_base_h: number | null
  capacity_max_h: number | null
}

type ItemRow = Owned & {
  sphere: string
  title: string
  type: string | null
  status: string | null
  priority: string | null
  area: string | null
  due_date: string | null
  due_time: string | null
  ready_by: string | null
  week_id: string | null
  hours_est: number | null
  waiting_on: string | null
  people: string[]
  links: string[]
  synergy: string | null
  trap: string | null
  data_status: string | null
  next_step: string | null
  clickup: string | null
  notes: string | null
  outcome: string | null
  done_at: string | null
  sort_order: number
}

type ItemInsert = Partial<ItemRow> & Pick<ItemRow, 'sphere' | 'title'>

export type Database = {
  public: {
    Tables: {
      weeks: {
        Row: WeekRow
        Insert: Partial<Omit<WeekRow, 'end_date'>> & Pick<WeekRow, 'start_date'>
        Update: Partial<Omit<WeekRow, 'end_date'>>
        Relationships: []
      }
      items: {
        Row: ItemRow
        Insert: ItemInsert
        Update: Partial<ItemRow>
        Relationships: [
          {
            foreignKeyName: 'items_week_id_fkey'
            columns: ['week_id']
            isOneToOne: false
            referencedRelation: 'weeks'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
