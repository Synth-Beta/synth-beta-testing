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
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          created_at: string
          event_id: string
          id: string
          user1_id: string
          user2_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          user1_id: string
          user2_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
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
          music_streaming_profile: string | null
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
          music_streaming_profile?: string | null
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
          music_streaming_profile?: string | null
        }
        Relationships: []
      }
      user_swipes: {
        Row: {
          created_at: string
          event_id: string
          id: string
          is_interested: boolean
          swiped_user_id: string
          swiper_user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          is_interested: boolean
          swiped_user_id: string
          swiper_user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
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
      artist_profile: {
        Row: {
          id: string
          jambase_artist_id: string
          artist_data_source: string
          name: string
          identifier: string
          url: string | null
          image_url: string | null
          date_published: string | null
          date_modified: string | null
          artist_type: string | null
          band_or_musician: string | null
          founding_location: string | null
          founding_date: string | null
          genres: string[] | null
          members: Json | null
          member_of: Json | null
          external_identifiers: Json | null
          same_as: Json | null
          num_upcoming_events: number
          raw_jambase_data: Json | null
          created_at: string
          updated_at: string
          last_synced_at: string | null
        }
        Insert: {
          id?: string
          jambase_artist_id: string
          artist_data_source?: string
          name: string
          identifier: string
          url?: string | null
          image_url?: string | null
          date_published?: string | null
          date_modified?: string | null
          artist_type?: string | null
          band_or_musician?: string | null
          founding_location?: string | null
          founding_date?: string | null
          genres?: string[] | null
          members?: Json | null
          member_of?: Json | null
          external_identifiers?: Json | null
          same_as?: Json | null
          num_upcoming_events?: number
          raw_jambase_data?: Json | null
          created_at?: string
          updated_at?: string
          last_synced_at?: string | null
        }
        Update: {
          id?: string
          jambase_artist_id?: string
          artist_data_source?: string
          name?: string
          identifier?: string
          url?: string | null
          image_url?: string | null
          date_published?: string | null
          date_modified?: string | null
          artist_type?: string | null
          band_or_musician?: string | null
          founding_location?: string | null
          founding_date?: string | null
          genres?: string[] | null
          members?: Json | null
          member_of?: Json | null
          external_identifiers?: Json | null
          same_as?: Json | null
          num_upcoming_events?: number
          raw_jambase_data?: Json | null
          created_at?: string
          updated_at?: string
          last_synced_at?: string | null
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          id: string
          sender_id: string
          receiver_id: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sender_id: string
          receiver_id: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          sender_id?: string
          receiver_id?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      friends: {
        Row: {
          id: string
          user1_id: string
          user2_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user1_id: string
          user2_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user1_id?: string
          user2_id?: string
          created_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          message: string
          data: Json | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title: string
          message: string
          data?: Json | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          title?: string
          message?: string
          data?: Json | null
          is_read?: boolean
          created_at?: string
        }
        Relationships: []
      }
      user_reviews: {
        Row: {
          id: string
          user_id: string
          event_id: string
          rating: number
          reaction_emoji: string | null
          review_text: string | null
          photos: string[] | null
          videos: string[] | null
          mood_tags: string[] | null
          genre_tags: string[] | null
          context_tags: string[] | null
          likes_count: number
          comments_count: number
          shares_count: number
          is_public: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          event_id: string
          rating: number
          reaction_emoji?: string | null
          review_text?: string | null
          photos?: string[] | null
          videos?: string[] | null
          mood_tags?: string[] | null
          genre_tags?: string[] | null
          context_tags?: string[] | null
          likes_count?: number
          comments_count?: number
          shares_count?: number
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          event_id?: string
          rating?: number
          reaction_emoji?: string | null
          review_text?: string | null
          photos?: string[] | null
          videos?: string[] | null
          mood_tags?: string[] | null
          genre_tags?: string[] | null
          context_tags?: string[] | null
          likes_count?: number
          comments_count?: number
          shares_count?: number
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reviews_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          }
        ]
      }
      review_likes: {
        Row: {
          id: string
          user_id: string
          review_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          review_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          review_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_likes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "user_reviews"
            referencedColumns: ["id"]
          }
        ]
      }
      review_comments: {
        Row: {
          id: string
          user_id: string
          review_id: string
          parent_comment_id: string | null
          comment_text: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          review_id: string
          parent_comment_id?: string | null
          comment_text: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          review_id?: string
          parent_comment_id?: string | null
          comment_text?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "user_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "review_comments"
            referencedColumns: ["id"]
          }
        ]
      }
      review_shares: {
        Row: {
          id: string
          user_id: string
          review_id: string
          share_platform: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          review_id: string
          share_platform?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          review_id?: string
          share_platform?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_shares_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "user_reviews"
            referencedColumns: ["id"]
          }
        ]
      }
      artists: {
        Row: {
          id: string
          jambase_artist_id: string
          name: string
          identifier: string
          url: string | null
          image_url: string | null
          date_published: string | null
          date_modified: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          jambase_artist_id: string
          name: string
          identifier: string
          url?: string | null
          image_url?: string | null
          date_published?: string | null
          date_modified?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          jambase_artist_id?: string
          name?: string
          identifier?: string
          url?: string | null
          image_url?: string | null
          date_published?: string | null
          date_modified?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      venues: {
        Row: {
          id: string
          jambase_venue_id: string
          name: string
          identifier: string
          url: string | null
          image_url: string | null
          address: string | null
          city: string | null
          state: string | null
          zip: string | null
          country: string | null
          latitude: number | null
          longitude: number | null
          date_published: string | null
          date_modified: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          jambase_venue_id: string
          name: string
          identifier: string
          url?: string | null
          image_url?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          zip?: string | null
          country?: string | null
          latitude?: number | null
          longitude?: number | null
          date_published?: string | null
          date_modified?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          jambase_venue_id?: string
          name?: string
          identifier?: string
          url?: string | null
          image_url?: string | null
          address?: string | null
          city?: string | null
          state?: string | null
          zip?: string | null
          country?: string | null
          latitude?: number | null
          longitude?: number | null
          date_published?: string | null
          date_modified?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_events: {
        Row: {
          id: string
          user_id: string
          artist_id: string
          venue_id: string
          event_name: string
          event_date: string
          event_time: string | null
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          artist_id: string
          venue_id: string
          event_name: string
          event_date: string
          event_time?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          artist_id?: string
          venue_id?: string
          event_name?: string
          event_date?: string
          event_time?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_events_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          }
        ]
      }
      user_interactions: {
        Row: {
          id: string
          user_id: string
          identity_issuer: string | null
          identity_sub: string | null
          global_user_id: string | null
          session_id: string | null
          event_type: string
          entity_type: string
          entity_id: string
          occurred_at: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          identity_issuer?: string | null
          identity_sub?: string | null
          global_user_id?: string | null
          session_id?: string | null
          event_type: string
          entity_type: string
          entity_id: string
          occurred_at?: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          identity_issuer?: string | null
          identity_sub?: string | null
          global_user_id?: string | null
          session_id?: string | null
          event_type?: string
          entity_type?: string
          entity_id?: string
          occurred_at?: string
          metadata?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      public_reviews_with_profiles: {
        Row: {
          id: string
          user_id: string
          event_id: string
          rating: number
          reaction_emoji: string | null
          review_text: string | null
          photos: string[] | null
          videos: string[] | null
          mood_tags: string[] | null
          genre_tags: string[] | null
          context_tags: string[] | null
          likes_count: number
          comments_count: number
          shares_count: number
          created_at: string
          updated_at: string
          reviewer_name: string
          reviewer_avatar: string | null
          event_title: string
          artist_name: string
          venue_name: string
          event_date: string
        }
        Relationships: []
      }
    }
    Functions: {
      populate_events_from_concerts: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      create_friend_request: {
        Args: {
          receiver_user_id: string
        }
        Returns: string
      }
      accept_friend_request: {
        Args: {
          request_id: string
        }
        Returns: undefined
      }
      decline_friend_request: {
        Args: {
          request_id: string
        }
        Returns: undefined
      }
      create_direct_chat: {
        Args: {
          user1_id: string
          user2_id: string
        }
        Returns: string
      }
      create_group_chat: {
        Args: {
          chat_name: string
          user_ids: string[]
          admin_id: string
        }
        Returns: string
      }
      get_user_chats: {
        Args: {
          user_id: string
        }
        Returns: {
          id: string
          chat_name: string
          is_group_chat: boolean
          users: string[]
          latest_message_id: string | null
          latest_message: string | null
          latest_message_created_at: string | null
          latest_message_sender_name: string | null
          group_admin_id: string | null
          created_at: string
          updated_at: string
        }[]
      }
      log_user_interaction: {
        Args: {
          p_session_id?: string | null
          p_event_type: string
          p_entity_type: string
          p_entity_id: string
          p_metadata?: Json
        }
        Returns: string
      }
      log_user_interactions_batch: {
        Args: {
          p_interactions: Json
        }
        Returns: string[]
      }
      unfriend_user: {
        Args: {
          friend_user_id: string
        }
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
