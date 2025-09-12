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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      concerts: {
        Row: {
          id: string
          artist: string
          venue: string
          date: string
          profile_pic: string | null
          tour: string | null
          setlist: string[] | null
          venue_location: string | null
          source: string
          confidence: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          artist: string
          venue: string
          date: string
          profile_pic?: string | null
          tour?: string | null
          setlist?: string[] | null
          venue_location?: string | null
          source?: string
          confidence?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          artist?: string
          venue?: string
          date?: string
          profile_pic?: string | null
          tour?: string | null
          setlist?: string[] | null
          venue_location?: string | null
          source?: string
          confidence?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      chats: {
        Row: {
          created_at: string
          id: string
          match_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_interests: {
        Row: {
          created_at: string
          event_id: number
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: number
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: number
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          created_at: string
          event_id: number
          id: string
          user1_id: string
          user2_id: string
        }
        Insert: {
          created_at?: string
          event_id: number
          id?: string
          user1_id: string
          user2_id: string
        }
        Update: {
          created_at?: string
          event_id?: number
          id?: string
          user1_id?: string
          user2_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
          instagram_handle: string | null
          snapchat_handle: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
          instagram_handle?: string | null
          snapchat_handle?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
          instagram_handle?: string | null
          snapchat_handle?: string | null
        }
        Relationships: []
      }
      user_swipes: {
        Row: {
          created_at: string
          event_id: number
          id: string
          is_interested: boolean
          swiped_user_id: string
          swiper_user_id: string
        }
        Insert: {
          created_at?: string
          event_id: number
          id?: string
          is_interested: boolean
          swiped_user_id: string
          swiper_user_id: string
        }
        Update: {
          created_at?: string
          event_id?: number
          id?: string
          is_interested?: boolean
          swiped_user_id?: string
          swiper_user_id?: string
        }
        Relationships: []
      }
      jambase_events: {
        Row: {
          id: string
          jambase_event_id: string | null
          title: string
          artist_name: string
          artist_id: string | null
          venue_name: string
          venue_id: string | null
          event_date: string
          doors_time: string | null
          description: string | null
          genres: string[] | null
          venue_address: string | null
          venue_city: string | null
          venue_state: string | null
          venue_zip: string | null
          latitude: number | null
          longitude: number | null
          ticket_available: boolean
          price_range: string | null
          ticket_urls: string[] | null
          setlist: Json | null
          tour_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          jambase_event_id?: string | null
          title: string
          artist_name: string
          artist_id?: string | null
          venue_name: string
          venue_id?: string | null
          event_date: string
          doors_time?: string | null
          description?: string | null
          genres?: string[] | null
          venue_address?: string | null
          venue_city?: string | null
          venue_state?: string | null
          venue_zip?: string | null
          latitude?: number | null
          longitude?: number | null
          ticket_available?: boolean
          price_range?: string | null
          ticket_urls?: string[] | null
          setlist?: Json | null
          tour_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          jambase_event_id?: string | null
          title?: string
          artist_name?: string
          artist_id?: string | null
          venue_name?: string
          venue_id?: string | null
          event_date?: string
          doors_time?: string | null
          description?: string | null
          genres?: string[] | null
          venue_address?: string | null
          venue_city?: string | null
          venue_state?: string | null
          venue_zip?: string | null
          latitude?: number | null
          longitude?: number | null
          ticket_available?: boolean
          price_range?: string | null
          ticket_urls?: string[] | null
          setlist?: Json | null
          tour_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_jambase_events: {
        Row: {
          id: string
          user_id: string
          jambase_event_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          jambase_event_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          jambase_event_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_jambase_events_jambase_event_id_fkey"
            columns: ["jambase_event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_jambase_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      populate_events_from_concerts: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
