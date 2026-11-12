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
      activities: {
        Row: {
          created_at: string
          date: string
          id: string
          minutes: number | null
          note: string | null
          source_id: string | null
          type_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          minutes?: number | null
          note?: string | null
          source_id?: string | null
          type_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          minutes?: number | null
          note?: string | null
          source_id?: string | null
          type_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "activity_types"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_types: {
        Row: {
          active: boolean
          created_at: string
          id: string
          intensity: string
          name: string
          points_per_10min: number
          sort_order: number
          source_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          intensity?: string
          name: string
          points_per_10min?: number
          sort_order?: number
          source_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          intensity?: string
          name?: string
          points_per_10min?: number
          sort_order?: number
          source_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      actual_balances: {
        Row: {
          account: string
          amount_eur: number
          created_at: string
          date: string
          envelope_id: string | null
          id: string
          origin: string
          source_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account: string
          amount_eur: number
          created_at?: string
          date: string
          envelope_id?: string | null
          id?: string
          origin?: string
          source_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          account?: string
          amount_eur?: number
          created_at?: string
          date?: string
          envelope_id?: string | null
          id?: string
          origin?: string
          source_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "actual_balances_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: false
            referencedRelation: "envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          body_cream: boolean
          care: string[]
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
        }
        Insert: {
          body_cream?: boolean
          care?: string[]
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
        }
        Update: {
          body_cream?: boolean
          care?: string[]
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
        }
        Relationships: []
      }
      debts: {
        Row: {
          amount_eur: number
          created_at: string
          direction: string
          due_date: string | null
          id: string
          note: string | null
          pot_id: string | null
          repaid_eur: number | null
          source_id: string | null
          status: string
          updated_at: string
          user_id: string
          who: string
        }
        Insert: {
          amount_eur: number
          created_at?: string
          direction: string
          due_date?: string | null
          id?: string
          note?: string | null
          pot_id?: string | null
          repaid_eur?: number | null
          source_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          who: string
        }
        Update: {
          amount_eur?: number
          created_at?: string
          direction?: string
          due_date?: string | null
          id?: string
          note?: string | null
          pot_id?: string | null
          repaid_eur?: number | null
          source_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          who?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_pot_id_fkey"
            columns: ["pot_id"]
            isOneToOne: false
            referencedRelation: "envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      envelopes: {
        Row: {
          archived: boolean
          created_at: string
          goal_date: string | null
          goal_eur: number | null
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
          goal_date?: string | null
          goal_eur?: number | null
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
          goal_date?: string | null
          goal_eur?: number | null
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
      import_baseline: {
        Row: {
          created_at: string
          data: Json
          id: string
          imported_at: string
          removed: boolean
          source_id: string
          table_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          imported_at?: string
          removed?: boolean
          source_id: string
          table_name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          imported_at?: string
          removed?: boolean
          source_id?: string
          table_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      intake: {
        Row: {
          created_at: string
          dose: string | null
          end_date: string | null
          id: string
          kind: string
          name: string
          note: string | null
          schedule: string | null
          source_id: string | null
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dose?: string | null
          end_date?: string | null
          id?: string
          kind?: string
          name: string
          note?: string | null
          schedule?: string | null
          source_id?: string | null
          start_date: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          dose?: string | null
          end_date?: string | null
          id?: string
          kind?: string
          name?: string
          note?: string | null
          schedule?: string | null
          source_id?: string | null
          start_date?: string
          updated_at?: string
          user_id?: string
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
          happens_on: string | null
          happens_time: string | null
          hours_est: number | null
          id: string
          is_fixed: boolean | null
          links: string[]
          next_step: string | null
          notes: string | null
          outcome: string | null
          people: string[]
          priority: string | null
          ready_by: string | null
          rollover_count: number
          sort_order: number
          source_id: string | null
          sphere: string
          starts_on: string | null
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
          happens_on?: string | null
          happens_time?: string | null
          hours_est?: number | null
          id?: string
          is_fixed?: boolean | null
          links?: string[]
          next_step?: string | null
          notes?: string | null
          outcome?: string | null
          people?: string[]
          priority?: string | null
          ready_by?: string | null
          rollover_count?: number
          sort_order?: number
          source_id?: string | null
          sphere: string
          starts_on?: string | null
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
          happens_on?: string | null
          happens_time?: string | null
          hours_est?: number | null
          id?: string
          is_fixed?: boolean | null
          links?: string[]
          next_step?: string | null
          notes?: string | null
          outcome?: string | null
          people?: string[]
          priority?: string | null
          ready_by?: string | null
          rollover_count?: number
          sort_order?: number
          source_id?: string | null
          sphere?: string
          starts_on?: string | null
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
      measurements: {
        Row: {
          arm_cm: number | null
          created_at: string
          date: string
          hips_cm: number | null
          id: string
          note: string | null
          photo_body: boolean
          photo_face: boolean
          photo_part: boolean
          source_id: string | null
          thigh_cm: number | null
          updated_at: string
          user_id: string
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          arm_cm?: number | null
          created_at?: string
          date: string
          hips_cm?: number | null
          id?: string
          note?: string | null
          photo_body?: boolean
          photo_face?: boolean
          photo_part?: boolean
          source_id?: string | null
          thigh_cm?: number | null
          updated_at?: string
          user_id?: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          arm_cm?: number | null
          created_at?: string
          date?: string
          hips_cm?: number | null
          id?: string
          note?: string | null
          photo_body?: boolean
          photo_face?: boolean
          photo_part?: boolean
          source_id?: string | null
          thigh_cm?: number | null
          updated_at?: string
          user_id?: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: []
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
      people: {
        Row: {
          created_at: string
          id: string
          name: string
          role: string | null
          source_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          role?: string | null
          source_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role?: string | null
          source_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_stages: {
        Row: {
          care_items: string[]
          created_at: string
          end_date: string
          habits: string[]
          id: string
          minimum_habits: string[]
          name: string
          source_id: string | null
          sphere: string
          start_date: string
          targets: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          care_items?: string[]
          created_at?: string
          end_date: string
          habits?: string[]
          id?: string
          minimum_habits?: string[]
          name: string
          source_id?: string | null
          sphere?: string
          start_date: string
          targets?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          care_items?: string[]
          created_at?: string
          end_date?: string
          habits?: string[]
          id?: string
          minimum_habits?: string[]
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
      reviews: {
        Row: {
          answers: Json
          balances: Json
          completed_at: string | null
          created_at: string
          id: string
          impulse_note: string | null
          source_id: string | null
          updated_at: string
          user_id: string
          week_id: string
          week_thought: string | null
        }
        Insert: {
          answers?: Json
          balances?: Json
          completed_at?: string | null
          created_at?: string
          id?: string
          impulse_note?: string | null
          source_id?: string | null
          updated_at?: string
          user_id?: string
          week_id: string
          week_thought?: string | null
        }
        Update: {
          answers?: Json
          balances?: Json
          completed_at?: string | null
          created_at?: string
          id?: string
          impulse_note?: string | null
          source_id?: string | null
          updated_at?: string
          user_id?: string
          week_id?: string
          week_thought?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      strength_sets: {
        Row: {
          created_at: string
          date: string
          exercise: string
          hard_at_end: boolean | null
          id: string
          load: string | null
          note: string | null
          reps: number[]
          source_id: string | null
          updated_at: string
          user_id: string
          workout: string | null
        }
        Insert: {
          created_at?: string
          date: string
          exercise: string
          hard_at_end?: boolean | null
          id?: string
          load?: string | null
          note?: string | null
          reps?: number[]
          source_id?: string | null
          updated_at?: string
          user_id?: string
          workout?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          exercise?: string
          hard_at_end?: boolean | null
          id?: string
          load?: string | null
          note?: string | null
          reps?: number[]
          source_id?: string | null
          updated_at?: string
          user_id?: string
          workout?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account: string | null
          amount_eur: number
          cancelled_at: string | null
          category: string | null
          confirmed_at: string | null
          created_at: string
          date: string
          debt_id: string | null
          entry_kind: string
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
          week_no: number | null
        }
        Insert: {
          account?: string | null
          amount_eur: number
          cancelled_at?: string | null
          category?: string | null
          confirmed_at?: string | null
          created_at?: string
          date: string
          debt_id?: string | null
          entry_kind?: string
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
          week_no?: number | null
        }
        Update: {
          account?: string | null
          amount_eur?: number
          cancelled_at?: string | null
          category?: string | null
          confirmed_at?: string | null
          created_at?: string
          date?: string
          debt_id?: string | null
          entry_kind?: string
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
          week_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
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
      wishlist: {
        Row: {
          added_at: string
          created_at: string
          decided_at: string | null
          decision: string | null
          id: string
          price_eur: number | null
          source_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          added_at?: string
          created_at?: string
          decided_at?: string | null
          decision?: string | null
          id?: string
          price_eur?: number | null
          source_id?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          added_at?: string
          created_at?: string
          decided_at?: string | null
          decision?: string | null
          id?: string
          price_eur?: number | null
          source_id?: string | null
          title?: string
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
      ping: { Args: never; Returns: number }
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
