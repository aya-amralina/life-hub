export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      daily_logs: {
        Row: {
          body_cream: boolean
          created_at: string
          date: string
          energy: number | null
          face_evening: string | null
          id: string
          minimum_mode: boolean
          mood: number | null
          morning: boolean
          note: string | null
          outside: boolean
          sleep_h: number | null
          slump: boolean | null
          source_id: string | null
          updated_at: string
          user_id: string
          water: boolean
          workout_min: number | null
          workout_type: string | null
        }
        Insert: {
          body_cream?: boolean
          created_at?: string
          date: string
          energy?: number | null
          face_evening?: string | null
          id?: string
          minimum_mode?: boolean
          mood?: number | null
          morning?: boolean
          note?: string | null
          outside?: boolean
          sleep_h?: number | null
          slump?: boolean | null
          source_id?: string | null
          updated_at?: string
          user_id?: string
          water?: boolean
          workout_min?: number | null
          workout_type?: string | null
        }
        Update: {
          body_cream?: boolean
          created_at?: string
          date?: string
          energy?: number | null
          face_evening?: string | null
          id?: string
          minimum_mode?: boolean
          mood?: number | null
          morning?: boolean
          note?: string | null
          outside?: boolean
          sleep_h?: number | null
          slump?: boolean | null
          source_id?: string | null
          updated_at?: string
          user_id?: string
          water?: boolean
          workout_min?: number | null
          workout_type?: string | null
        }
        Relationships: []
      }
      envelopes: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          name: string
          note: string | null
          planned_eur: number | null
          source_id: string | null
          type: string
          updated_at: string
          user_id: string
          when_text: string | null
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          name: string
          note?: string | null
          planned_eur?: number | null
          source_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          when_text?: string | null
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          planned_eur?: number | null
          source_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          when_text?: string | null
        }
        Relationships: []
      }
      items: {
        Row: {
          area: string | null
          clickup: string | null
          created_at: string
          data_status: string | null
          done_at: string | null
          due_date: string | null
          due_time: string | null
          hours_est: number | null
          id: string
          links: string[]
          next_step: string | null
          notes: string | null
          outcome: string | null
          people: string[]
          priority: string | null
          ready_by: string | null
          sort_order: number
          source_id: string | null
          sphere: string
          status: string | null
          synergy: string | null
          title: string
          trap: string | null
          type: string | null
          updated_at: string
          user_id: string
          waiting_on: string | null
          week_id: string | null
        }
        Insert: {
          area?: string | null
          clickup?: string | null
          created_at?: string
          data_status?: string | null
          done_at?: string | null
          due_date?: string | null
          due_time?: string | null
          hours_est?: number | null
          id?: string
          links?: string[]
          next_step?: string | null
          notes?: string | null
          outcome?: string | null
          people?: string[]
          priority?: string | null
          ready_by?: string | null
          sort_order?: number
          source_id?: string | null
          sphere: string
          status?: string | null
          synergy?: string | null
          title: string
          trap?: string | null
          type?: string | null
          updated_at?: string
          user_id?: string
          waiting_on?: string | null
          week_id?: string | null
        }
        Update: {
          area?: string | null
          clickup?: string | null
          created_at?: string
          data_status?: string | null
          done_at?: string | null
          due_date?: string | null
          due_time?: string | null
          hours_est?: number | null
          id?: string
          links?: string[]
          next_step?: string | null
          notes?: string | null
          outcome?: string | null
          people?: string[]
          priority?: string | null
          ready_by?: string | null
          sort_order?: number
          source_id?: string | null
          sphere?: string
          status?: string | null
          synergy?: string | null
          title?: string
          trap?: string | null
          type?: string | null
          updated_at?: string
          user_id?: string
          waiting_on?: string | null
          week_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body_md: string | null
          created_at: string
          id: string
          pinned: boolean
          source_id: string | null
          sphere: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body_md?: string | null
          created_at?: string
          id?: string
          pinned?: boolean
          source_id?: string | null
          sphere: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          body_md?: string | null
          created_at?: string
          id?: string
          pinned?: boolean
          source_id?: string | null
          sphere?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_stages: {
        Row: {
          created_at: string
          end_date: string
          habits: string[]
          id: string
          name: string
          source_id: string | null
          sphere: string
          start_date: string
          targets: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          habits?: string[]
          id?: string
          name: string
          source_id?: string | null
          sphere?: string
          start_date: string
          targets?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          habits?: string[]
          id?: string
          name?: string
          source_id?: string | null
          sphere?: string
          start_date?: string
          targets?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account: string | null
          amount_eur: number
          category: string | null
          confirmed_at: string | null
          created_at: string
          date: string
          envelope_id: string | null
          grp: string | null
          id: string
          is_planned: boolean
          kind: string
          note: string | null
          source_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account?: string | null
          amount_eur: number
          category?: string | null
          confirmed_at?: string | null
          created_at?: string
          date: string
          envelope_id?: string | null
          grp?: string | null
          id?: string
          is_planned?: boolean
          kind: string
          note?: string | null
          source_id?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          account?: string | null
          amount_eur?: number
          category?: string | null
          confirmed_at?: string | null
          created_at?: string
          date?: string
          envelope_id?: string | null
          grp?: string | null
          id?: string
          is_planned?: boolean
          kind?: string
          note?: string | null
          source_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: false
            referencedRelation: "envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      week_limits: {
        Row: {
          category: string
          created_at: string
          id: string
          limit_eur: number
          source_id: string | null
          updated_at: string
          user_id: string
          week_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          limit_eur: number
          source_id?: string | null
          updated_at?: string
          user_id?: string
          week_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          limit_eur?: number
          source_id?: string | null
          updated_at?: string
          user_id?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_limits_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      weeks: {
        Row: {
          budget_week_no: number | null
          capacity_base_h: number | null
          capacity_max_h: number | null
          created_at: string
          end_date: string | null
          events: string | null
          glowup_week_no: number | null
          id: string
          place_mode: string | null
          source_id: string | null
          start_date: string
          study_week: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_week_no?: number | null
          capacity_base_h?: number | null
          capacity_max_h?: number | null
          created_at?: string
          end_date?: string | null
          events?: string | null
          glowup_week_no?: number | null
          id?: string
          place_mode?: string | null
          source_id?: string | null
          start_date: string
          study_week?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          budget_week_no?: number | null
          capacity_base_h?: number | null
          capacity_max_h?: number | null
          created_at?: string
          end_date?: string | null
          events?: string | null
          glowup_week_no?: number | null
          id?: string
          place_mode?: string | null
          source_id?: string | null
          start_date?: string
          study_week?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
