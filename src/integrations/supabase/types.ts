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
      account_permissions: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          created_at: string | null
          granted: boolean | null
          id: string
          permission_description: string | null
          permission_key: string
          permission_name: string
        }
        Insert: {
          account_type: Database["public"]["Enums"]["account_type"]
          created_at?: string | null
          granted?: boolean | null
          id?: string
          permission_description?: string | null
          permission_key: string
          permission_name: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          created_at?: string | null
          granted?: boolean | null
          id?: string
          permission_description?: string | null
          permission_key?: string
          permission_name?: string
        }
        Relationships: []
      }
      account_upgrade_requests: {
        Row: {
          business_info: Json | null
          created_at: string | null
          denial_reason: string | null
          id: string
          requested_account_type: Database["public"]["Enums"]["account_type"]
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          business_info?: Json | null
          created_at?: string | null
          denial_reason?: string | null
          id?: string
          requested_account_type: Database["public"]["Enums"]["account_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          business_info?: Json | null
          created_at?: string | null
          denial_reason?: string | null
          id?: string
          requested_account_type?: Database["public"]["Enums"]["account_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_actions: {
        Row: {
          action_details: Json | null
          action_type: string
          admin_user_id: string
          created_at: string | null
          id: string
          reason: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          action_details?: Json | null
          action_type: string
          admin_user_id: string
          created_at?: string | null
          id?: string
          reason?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          action_details?: Json | null
          action_type?: string
          admin_user_id?: string
          created_at?: string | null
          id?: string
          reason?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      artist_follows: {
        Row: {
          artist_genres: string[] | null
          artist_id: string
          artist_popularity: number | null
          created_at: string
          id: string
          music_captured: boolean | null
          music_metadata: Json | null
          profile_id: string | null
          profile_user_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          artist_genres?: string[] | null
          artist_id: string
          artist_popularity?: number | null
          created_at?: string
          id?: string
          music_captured?: boolean | null
          music_metadata?: Json | null
          profile_id?: string | null
          profile_user_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          artist_genres?: string[] | null
          artist_id?: string
          artist_popularity?: number | null
          created_at?: string
          id?: string
          music_captured?: boolean | null
          music_metadata?: Json | null
          profile_id?: string | null
          profile_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_artists_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_user_artists_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_artists_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_artists_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_genre_mapping: {
        Row: {
          apple_music_artist_id: string | null
          artist_id: string | null
          artist_name: string
          genre_confidence: Json | null
          genres: string[] | null
          id: string
          jambase_artist_id: string | null
          last_updated: string
          source: string | null
          spotify_artist_id: string | null
          subgenres: string[] | null
        }
        Insert: {
          apple_music_artist_id?: string | null
          artist_id?: string | null
          artist_name: string
          genre_confidence?: Json | null
          genres?: string[] | null
          id?: string
          jambase_artist_id?: string | null
          last_updated?: string
          source?: string | null
          spotify_artist_id?: string | null
          subgenres?: string[] | null
        }
        Update: {
          apple_music_artist_id?: string | null
          artist_id?: string | null
          artist_name?: string
          genre_confidence?: Json | null
          genres?: string[] | null
          id?: string
          jambase_artist_id?: string | null
          last_updated?: string
          source?: string | null
          spotify_artist_id?: string | null
          subgenres?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_genre_mapping_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: true
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_genres: {
        Row: {
          artist_id: string
          genre: string
          id: string
        }
        Insert: {
          artist_id: string
          genre: string
          id?: string
        }
        Update: {
          artist_id?: string
          genre?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_genres_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_profile: {
        Row: {
          artist_data_source: string
          artist_type: string | null
          band_or_musician: string | null
          created_at: string | null
          date_modified: string | null
          date_published: string | null
          external_identifiers: Json | null
          founding_date: string | null
          founding_location: string | null
          genres: string[] | null
          id: string
          identifier: string
          image_url: string | null
          is_user_created: boolean | null
          jambase_artist_id: string
          last_synced_at: string | null
          member_of: Json | null
          members: Json | null
          name: string
          num_upcoming_events: number | null
          raw_jambase_data: Json | null
          same_as: Json | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          artist_data_source?: string
          artist_type?: string | null
          band_or_musician?: string | null
          created_at?: string | null
          date_modified?: string | null
          date_published?: string | null
          external_identifiers?: Json | null
          founding_date?: string | null
          founding_location?: string | null
          genres?: string[] | null
          id?: string
          identifier: string
          image_url?: string | null
          is_user_created?: boolean | null
          jambase_artist_id: string
          last_synced_at?: string | null
          member_of?: Json | null
          members?: Json | null
          name: string
          num_upcoming_events?: number | null
          raw_jambase_data?: Json | null
          same_as?: Json | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          artist_data_source?: string
          artist_type?: string | null
          band_or_musician?: string | null
          created_at?: string | null
          date_modified?: string | null
          date_published?: string | null
          external_identifiers?: Json | null
          founding_date?: string | null
          founding_location?: string | null
          genres?: string[] | null
          id?: string
          identifier?: string
          image_url?: string | null
          is_user_created?: boolean | null
          jambase_artist_id?: string
          last_synced_at?: string | null
          member_of?: Json | null
          members?: Json | null
          name?: string
          num_upcoming_events?: number | null
          raw_jambase_data?: Json | null
          same_as?: Json | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
      artists: {
        Row: {
          bio: string | null
          created_at: string
          date_modified: string | null
          date_published: string | null
          genres: string[] | null
          id: string
          identifier: string
          image_url: string | null
          is_user_created: boolean | null
          jambase_artist_id: string
          name: string
          updated_at: string
          url: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          date_modified?: string | null
          date_published?: string | null
          genres?: string[] | null
          id?: string
          identifier: string
          image_url?: string | null
          is_user_created?: boolean | null
          jambase_artist_id: string
          name: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          date_modified?: string | null
          date_published?: string | null
          genres?: string[] | null
          id?: string
          identifier?: string
          image_url?: string | null
          is_user_created?: boolean | null
          jambase_artist_id?: string
          name?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      chats: {
        Row: {
          chat_name: string | null
          created_at: string | null
          group_admin_id: string | null
          id: string
          is_group_chat: boolean | null
          latest_message_id: string | null
          updated_at: string | null
          users: string[] | null
        }
        Insert: {
          chat_name?: string | null
          created_at?: string | null
          group_admin_id?: string | null
          id?: string
          is_group_chat?: boolean | null
          latest_message_id?: string | null
          updated_at?: string | null
          users?: string[] | null
        }
        Update: {
          chat_name?: string | null
          created_at?: string | null
          group_admin_id?: string | null
          id?: string
          is_group_chat?: boolean | null
          latest_message_id?: string | null
          updated_at?: string | null
          users?: string[] | null
        }
        Relationships: []
      }
      email_gate_entries: {
        Row: {
          created_at: string
          email: string
          id: string
          ip_address: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip_address: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip_address?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      email_preferences: {
        Row: {
          created_at: string
          enable_auth_emails: boolean
          enable_event_reminders: boolean
          enable_match_notifications: boolean
          enable_review_notifications: boolean
          enable_weekly_digest: boolean
          event_reminder_days: number | null
          id: string
          updated_at: string
          user_id: string
          weekly_digest_day: string | null
        }
        Insert: {
          created_at?: string
          enable_auth_emails?: boolean
          enable_event_reminders?: boolean
          enable_match_notifications?: boolean
          enable_review_notifications?: boolean
          enable_weekly_digest?: boolean
          event_reminder_days?: number | null
          id?: string
          updated_at?: string
          user_id: string
          weekly_digest_day?: string | null
        }
        Update: {
          created_at?: string
          enable_auth_emails?: boolean
          enable_event_reminders?: boolean
          enable_match_notifications?: boolean
          enable_review_notifications?: boolean
          enable_weekly_digest?: boolean
          event_reminder_days?: number | null
          id?: string
          updated_at?: string
          user_id?: string
          weekly_digest_day?: string | null
        }
        Relationships: []
      }
      event_claims: {
        Row: {
          admin_notes: string | null
          claim_reason: string | null
          claim_status: string | null
          claimer_user_id: string
          created_at: string | null
          event_id: string
          id: string
          reviewed_at: string | null
          reviewed_by_admin_id: string | null
          updated_at: string | null
          verification_proof: string | null
        }
        Insert: {
          admin_notes?: string | null
          claim_reason?: string | null
          claim_status?: string | null
          claimer_user_id: string
          created_at?: string | null
          event_id: string
          id?: string
          reviewed_at?: string | null
          reviewed_by_admin_id?: string | null
          updated_at?: string | null
          verification_proof?: string | null
        }
        Update: {
          admin_notes?: string | null
          claim_reason?: string | null
          claim_status?: string | null
          claimer_user_id?: string
          created_at?: string | null
          event_id?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by_admin_id?: string | null
          updated_at?: string | null
          verification_proof?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_claims_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_claims_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_comments: {
        Row: {
          comment_text: string
          created_at: string
          event_id: string
          id: string
          parent_comment_id: string | null
          profile_id: string | null
          profile_user_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          event_id: string
          id?: string
          parent_comment_id?: string | null
          profile_id?: string | null
          profile_user_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          event_id?: string
          id?: string
          parent_comment_id?: string | null
          profile_id?: string | null
          profile_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_comments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "event_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_comments_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_event_comments_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event_genres: {
        Row: {
          event_id: string
          genre: string
          id: string
        }
        Insert: {
          event_id: string
          genre: string
          id?: string
        }
        Update: {
          event_id?: string
          genre?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_genres_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_genres_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string | null
          last_active_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string | null
          last_active_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string | null
          last_active_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "event_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      event_groups: {
        Row: {
          chat_id: string | null
          cover_image_url: string | null
          created_at: string | null
          created_by_user_id: string
          description: string | null
          event_id: string
          id: string
          is_public: boolean | null
          max_members: number | null
          member_count: number | null
          name: string
          updated_at: string | null
        }
        Insert: {
          chat_id?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          created_by_user_id: string
          description?: string | null
          event_id: string
          id?: string
          is_public?: boolean | null
          max_members?: number | null
          member_count?: number | null
          name: string
          updated_at?: string | null
        }
        Update: {
          chat_id?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          created_by_user_id?: string
          description?: string | null
          event_id?: string
          id?: string
          is_public?: boolean | null
          max_members?: number | null
          member_count?: number | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_groups_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_groups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_groups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_interests: {
        Row: {
          created_at: string
          event_id: number
          event_uuid: string | null
          id: string
          profile_user_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: number
          event_uuid?: string | null
          id?: string
          profile_user_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: number
          event_uuid?: string | null
          id?: string
          profile_user_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_event_interests_event_uuid"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_interests_event_uuid"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_interests_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_event_interests_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event_likes: {
        Row: {
          created_at: string
          event_id: string
          id: string
          profile_id: string | null
          profile_user_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          profile_id?: string | null
          profile_user_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          profile_id?: string | null
          profile_user_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_likes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_likes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_likes_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_event_likes_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event_photo_comments: {
        Row: {
          comment: string
          created_at: string | null
          id: string
          photo_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string | null
          id?: string
          photo_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string | null
          id?: string
          photo_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_photo_comments_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "event_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      event_photo_likes: {
        Row: {
          created_at: string | null
          id: string
          photo_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          photo_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          photo_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_photo_likes_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "event_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      event_photos: {
        Row: {
          caption: string | null
          comments_count: number | null
          created_at: string | null
          event_id: string
          id: string
          is_featured: boolean | null
          likes_count: number | null
          photo_url: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          comments_count?: number | null
          created_at?: string | null
          event_id: string
          id?: string
          is_featured?: boolean | null
          likes_count?: number | null
          photo_url: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          caption?: string | null
          comments_count?: number | null
          created_at?: string | null
          event_id?: string
          id?: string
          is_featured?: boolean | null
          likes_count?: number | null
          photo_url?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_promotions: {
        Row: {
          admin_notes: string | null
          clicks: number | null
          conversions: number | null
          created_at: string | null
          currency: string | null
          event_id: string
          expires_at: string
          id: string
          impressions: number | null
          payment_status: string | null
          price_paid: number | null
          promoted_by_user_id: string
          promotion_status: string | null
          promotion_tier: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by_admin_id: string | null
          starts_at: string
          stripe_payment_intent_id: string | null
          target_age_max: number | null
          target_age_min: number | null
          target_cities: string[] | null
          target_genres: string[] | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string | null
          currency?: string | null
          event_id: string
          expires_at: string
          id?: string
          impressions?: number | null
          payment_status?: string | null
          price_paid?: number | null
          promoted_by_user_id: string
          promotion_status?: string | null
          promotion_tier?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by_admin_id?: string | null
          starts_at: string
          stripe_payment_intent_id?: string | null
          target_age_max?: number | null
          target_age_min?: number | null
          target_cities?: string[] | null
          target_genres?: string[] | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          clicks?: number | null
          conversions?: number | null
          created_at?: string | null
          currency?: string | null
          event_id?: string
          expires_at?: string
          id?: string
          impressions?: number | null
          payment_status?: string | null
          price_paid?: number | null
          promoted_by_user_id?: string
          promotion_status?: string | null
          promotion_tier?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by_admin_id?: string | null
          starts_at?: string
          stripe_payment_intent_id?: string | null
          target_age_max?: number | null
          target_age_min?: number | null
          target_cities?: string[] | null
          target_genres?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_promotions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_promotions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_shares: {
        Row: {
          chat_id: string | null
          created_at: string | null
          event_id: string
          id: string
          message_id: string | null
          share_type: string
          sharer_user_id: string
        }
        Insert: {
          chat_id?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          message_id?: string | null
          share_type: string
          sharer_user_id: string
        }
        Update: {
          chat_id?: string | null
          created_at?: string | null
          event_id?: string
          id?: string
          message_id?: string | null
          share_type?: string
          sharer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_shares_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_shares_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_shares_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_shares_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ticket_urls: {
        Row: {
          event_id: string
          id: string
          ticket_url: string
        }
        Insert: {
          event_id: string
          id?: string
          ticket_url: string
        }
        Update: {
          event_id?: string
          id?: string
          ticket_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_ticket_urls_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ticket_urls_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tickets: {
        Row: {
          available_from: string | null
          available_until: string | null
          created_at: string | null
          currency: string | null
          event_id: string
          id: string
          is_primary: boolean | null
          price_max: number | null
          price_min: number | null
          ticket_provider: string
          ticket_type: string | null
          ticket_url: string
          updated_at: string | null
        }
        Insert: {
          available_from?: string | null
          available_until?: string | null
          created_at?: string | null
          currency?: string | null
          event_id: string
          id?: string
          is_primary?: boolean | null
          price_max?: number | null
          price_min?: number | null
          ticket_provider: string
          ticket_type?: string | null
          ticket_url: string
          updated_at?: string | null
        }
        Update: {
          available_from?: string | null
          available_until?: string | null
          created_at?: string | null
          currency?: string | null
          event_id?: string
          id?: string
          is_primary?: boolean | null
          price_max?: number | null
          price_min?: number | null
          ticket_provider?: string
          ticket_type?: string | null
          ticket_url?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string
          id: string
          receiver_id: string
          receiver_profile_id: string | null
          receiver_profile_user_id: string | null
          sender_id: string
          sender_profile_id: string | null
          sender_profile_user_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          receiver_id: string
          receiver_profile_id?: string | null
          receiver_profile_user_id?: string | null
          sender_id: string
          sender_profile_id?: string | null
          sender_profile_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          receiver_id?: string
          receiver_profile_id?: string | null
          receiver_profile_user_id?: string | null
          sender_id?: string
          sender_profile_id?: string | null
          sender_profile_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_friend_requests_receiver_profile"
            columns: ["receiver_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_friend_requests_receiver_profile"
            columns: ["receiver_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_friend_requests_receiver_profile_user"
            columns: ["receiver_profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_friend_requests_receiver_profile_user"
            columns: ["receiver_profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_friend_requests_sender_profile"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_friend_requests_sender_profile"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_friend_requests_sender_profile_user"
            columns: ["sender_profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_friend_requests_sender_profile_user"
            columns: ["sender_profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
        ]
      }
      friends: {
        Row: {
          created_at: string
          id: string
          user1_id: string
          user1_profile_id: string | null
          user1_profile_user_id: string | null
          user2_id: string
          user2_profile_id: string | null
          user2_profile_user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          user1_id: string
          user1_profile_id?: string | null
          user1_profile_user_id?: string | null
          user2_id: string
          user2_profile_id?: string | null
          user2_profile_user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          user1_id?: string
          user1_profile_id?: string | null
          user1_profile_user_id?: string | null
          user2_id?: string
          user2_profile_id?: string | null
          user2_profile_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_friends_user1_profile"
            columns: ["user1_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_friends_user1_profile"
            columns: ["user1_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_friends_user1_profile_user"
            columns: ["user1_profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_friends_user1_profile_user"
            columns: ["user1_profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_friends_user2_profile"
            columns: ["user2_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_friends_user2_profile"
            columns: ["user2_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_friends_user2_profile_user"
            columns: ["user2_profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_friends_user2_profile_user"
            columns: ["user2_profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
        ]
      }
      jambase_events: {
        Row: {
          accessibility_info: string | null
          age_restriction: string | null
          artist_id: string | null
          artist_name: string | null
          artist_uuid: string | null
          claimed_by_creator_id: string | null
          created_at: string | null
          created_by_user_id: string | null
          description: string | null
          doors_time: string | null
          estimated_attendance: number | null
          event_date: string | null
          event_status: string | null
          featured_until: string | null
          genres: string[] | null
          id: string
          is_featured: boolean | null
          is_user_created: boolean | null
          jambase_event_id: string | null
          latitude: number | null
          longitude: number | null
          media_urls: string[] | null
          owned_by_account_type: string | null
          parking_info: string | null
          poster_image_url: string | null
          price_range: string | null
          promotion_tier: string | null
          setlist: Json | null
          setlist_enriched: boolean | null
          setlist_fm_id: string | null
          setlist_fm_url: string | null
          setlist_last_updated: string | null
          setlist_song_count: number | null
          setlist_source: string | null
          ticket_available: boolean | null
          ticket_urls: string[] | null
          title: string | null
          tour_name: string | null
          updated_at: string | null
          venue_address: string | null
          venue_capacity: number | null
          venue_city: string | null
          venue_id: string | null
          venue_name: string | null
          venue_state: string | null
          venue_zip: string | null
          video_url: string | null
        }
        Insert: {
          accessibility_info?: string | null
          age_restriction?: string | null
          artist_id?: string | null
          artist_name?: string | null
          artist_uuid?: string | null
          claimed_by_creator_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string | null
          doors_time?: string | null
          estimated_attendance?: number | null
          event_date?: string | null
          event_status?: string | null
          featured_until?: string | null
          genres?: string[] | null
          id?: string
          is_featured?: boolean | null
          is_user_created?: boolean | null
          jambase_event_id?: string | null
          latitude?: number | null
          longitude?: number | null
          media_urls?: string[] | null
          owned_by_account_type?: string | null
          parking_info?: string | null
          poster_image_url?: string | null
          price_range?: string | null
          promotion_tier?: string | null
          setlist?: Json | null
          setlist_enriched?: boolean | null
          setlist_fm_id?: string | null
          setlist_fm_url?: string | null
          setlist_last_updated?: string | null
          setlist_song_count?: number | null
          setlist_source?: string | null
          ticket_available?: boolean | null
          ticket_urls?: string[] | null
          title?: string | null
          tour_name?: string | null
          updated_at?: string | null
          venue_address?: string | null
          venue_capacity?: number | null
          venue_city?: string | null
          venue_id?: string | null
          venue_name?: string | null
          venue_state?: string | null
          venue_zip?: string | null
          video_url?: string | null
        }
        Update: {
          accessibility_info?: string | null
          age_restriction?: string | null
          artist_id?: string | null
          artist_name?: string | null
          artist_uuid?: string | null
          claimed_by_creator_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string | null
          doors_time?: string | null
          estimated_attendance?: number | null
          event_date?: string | null
          event_status?: string | null
          featured_until?: string | null
          genres?: string[] | null
          id?: string
          is_featured?: boolean | null
          is_user_created?: boolean | null
          jambase_event_id?: string | null
          latitude?: number | null
          longitude?: number | null
          media_urls?: string[] | null
          owned_by_account_type?: string | null
          parking_info?: string | null
          poster_image_url?: string | null
          price_range?: string | null
          promotion_tier?: string | null
          setlist?: Json | null
          setlist_enriched?: boolean | null
          setlist_fm_id?: string | null
          setlist_fm_url?: string | null
          setlist_last_updated?: string | null
          setlist_song_count?: number | null
          setlist_source?: string | null
          ticket_available?: boolean | null
          ticket_urls?: string[] | null
          title?: string | null
          tour_name?: string | null
          updated_at?: string | null
          venue_address?: string | null
          venue_capacity?: number | null
          venue_city?: string | null
          venue_id?: string | null
          venue_name?: string | null
          venue_state?: string | null
          venue_zip?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jambase_events_artist_uuid_fkey"
            columns: ["artist_uuid"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          event_id: number
          event_uuid: string | null
          id: string
          user1_id: string
          user1_profile_id: string | null
          user2_id: string
          user2_profile_id: string | null
        }
        Insert: {
          created_at?: string
          event_id: number
          event_uuid?: string | null
          id?: string
          user1_id: string
          user1_profile_id?: string | null
          user2_id: string
          user2_profile_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: number
          event_uuid?: string | null
          id?: string
          user1_id?: string
          user1_profile_id?: string | null
          user2_id?: string
          user2_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_matches_event_uuid"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_matches_event_uuid"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_matches_user1_profile"
            columns: ["user1_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_matches_user1_profile"
            columns: ["user1_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_matches_user2_profile"
            columns: ["user2_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_matches_user2_profile"
            columns: ["user2_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string
          id: string
          message_type: string | null
          metadata: Json | null
          sender_id: string
          sender_profile_id: string | null
          shared_event_id: string | null
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string
          id?: string
          message_type?: string | null
          metadata?: Json | null
          sender_id: string
          sender_profile_id?: string | null
          shared_event_id?: string | null
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          message_type?: string | null
          metadata?: Json | null
          sender_id?: string
          sender_profile_id?: string | null
          shared_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_messages_sender_profile"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_messages_sender_profile"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_shared_event_id_fkey"
            columns: ["shared_event_id"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_shared_event_id_fkey"
            columns: ["shared_event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_flags: {
        Row: {
          action_taken: string | null
          content_id: string
          content_type: string
          created_at: string | null
          flag_details: string | null
          flag_reason: string
          flag_status: string | null
          flagged_by_user_id: string
          id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by_admin_id: string | null
          updated_at: string | null
        }
        Insert: {
          action_taken?: string | null
          content_id: string
          content_type: string
          created_at?: string | null
          flag_details?: string | null
          flag_reason: string
          flag_status?: string | null
          flagged_by_user_id: string
          id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_admin_id?: string | null
          updated_at?: string | null
        }
        Update: {
          action_taken?: string | null
          content_id?: string
          content_type?: string
          created_at?: string | null
          flag_details?: string | null
          flag_reason?: string
          flag_status?: string | null
          flagged_by_user_id?: string
          id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_admin_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      music_preference_signals: {
        Row: {
          confidence: number | null
          first_interaction: string
          id: string
          interaction_count: number
          interaction_types: Json | null
          last_interaction: string
          metadata: Json | null
          preference_score: number
          preference_type: string
          preference_value: string
          trend: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          first_interaction: string
          id?: string
          interaction_count?: number
          interaction_types?: Json | null
          last_interaction: string
          metadata?: Json | null
          preference_score?: number
          preference_type: string
          preference_value: string
          trend?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          first_interaction?: string
          id?: string
          interaction_count?: number
          interaction_types?: Json | null
          last_interaction?: string
          metadata?: Json | null
          preference_score?: number
          preference_type?: string
          preference_value?: string
          trend?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_user_id: string | null
          comment_id: string | null
          created_at: string
          data: Json | null
          id: string
          is_read: boolean
          message: string
          profile_id: string | null
          profile_user_id: string | null
          review_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_user_id?: string | null
          comment_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          message: string
          profile_id?: string | null
          profile_user_id?: string | null
          review_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_user_id?: string | null
          comment_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          message?: string
          profile_id?: string | null
          profile_user_id?: string | null
          review_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_notifications_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_notifications_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_notifications_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_notifications_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "review_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "public_reviews_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "user_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          avatar_url: string | null
          ban_reason: string | null
          bio: string | null
          birthday: string | null
          business_info: Json | null
          created_at: string
          gender: string | null
          id: string
          instagram_handle: string | null
          is_public_profile: boolean | null
          last_active_at: string | null
          last_warned_at: string | null
          location_city: string | null
          moderation_status: string | null
          music_streaming_profile: string | null
          name: string
          onboarding_completed: boolean | null
          onboarding_skipped: boolean | null
          similar_users_notifications: boolean | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_expires_at: string | null
          subscription_started_at: string | null
          subscription_tier:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
          suspended_until: string | null
          tour_completed: boolean | null
          updated_at: string
          user_id: string
          verification_level:
            | Database["public"]["Enums"]["verification_level"]
            | null
          verified: boolean | null
          warning_count: number | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          ban_reason?: string | null
          bio?: string | null
          birthday?: string | null
          business_info?: Json | null
          created_at?: string
          gender?: string | null
          id?: string
          instagram_handle?: string | null
          is_public_profile?: boolean | null
          last_active_at?: string | null
          last_warned_at?: string | null
          location_city?: string | null
          moderation_status?: string | null
          music_streaming_profile?: string | null
          name: string
          onboarding_completed?: boolean | null
          onboarding_skipped?: boolean | null
          similar_users_notifications?: boolean | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_expires_at?: string | null
          subscription_started_at?: string | null
          subscription_tier?:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
          suspended_until?: string | null
          tour_completed?: boolean | null
          updated_at?: string
          user_id: string
          verification_level?:
            | Database["public"]["Enums"]["verification_level"]
            | null
          verified?: boolean | null
          warning_count?: number | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          avatar_url?: string | null
          ban_reason?: string | null
          bio?: string | null
          birthday?: string | null
          business_info?: Json | null
          created_at?: string
          gender?: string | null
          id?: string
          instagram_handle?: string | null
          is_public_profile?: boolean | null
          last_active_at?: string | null
          last_warned_at?: string | null
          location_city?: string | null
          moderation_status?: string | null
          music_streaming_profile?: string | null
          name?: string
          onboarding_completed?: boolean | null
          onboarding_skipped?: boolean | null
          similar_users_notifications?: boolean | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_expires_at?: string | null
          subscription_started_at?: string | null
          subscription_tier?:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
          suspended_until?: string | null
          tour_completed?: boolean | null
          updated_at?: string
          user_id?: string
          verification_level?:
            | Database["public"]["Enums"]["verification_level"]
            | null
          verified?: boolean | null
          warning_count?: number | null
        }
        Relationships: []
      }
      review_comments: {
        Row: {
          comment_text: string
          created_at: string
          id: string
          parent_comment_id: string | null
          profile_id: string | null
          review_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          profile_id?: string | null
          review_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          profile_id?: string | null
          review_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_review_comments_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_review_comments_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "review_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "public_reviews_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "user_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_likes: {
        Row: {
          created_at: string
          id: string
          profile_id: string | null
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id?: string | null
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string | null
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_review_likes_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_review_likes_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_likes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "public_reviews_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_likes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "user_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_photos: {
        Row: {
          created_at: string | null
          id: string
          photo_url: string
          review_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          photo_url: string
          review_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          photo_url?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_photos_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "public_reviews_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_photos_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "user_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_shares: {
        Row: {
          created_at: string
          id: string
          profile_id: string | null
          review_id: string
          share_platform: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id?: string | null
          review_id: string
          share_platform?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string | null
          review_id?: string
          share_platform?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_review_shares_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_review_shares_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_shares_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_shares_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_shares_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "public_reviews_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_shares_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "user_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_tags: {
        Row: {
          created_at: string | null
          id: string
          review_id: string
          tag: string
          tag_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          review_id: string
          tag: string
          tag_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          review_id?: string
          tag?: string
          tag_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_tags_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "public_reviews_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_tags_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "user_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_videos: {
        Row: {
          created_at: string | null
          id: string
          review_id: string
          video_url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          review_id: string
          video_url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          review_id?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_videos_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "public_reviews_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_videos_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "user_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      streaming_profiles: {
        Row: {
          created_at: string | null
          id: string
          last_updated: string | null
          profile_data: Json
          service_type: string
          sync_status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_updated?: string | null
          profile_data: Json
          service_type: string
          sync_status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_updated?: string | null
          profile_data?: Json
          service_type?: string
          sync_status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_artist_interactions: {
        Row: {
          apple_music_artist_id: string | null
          artist_id: string | null
          artist_name: string
          created_at: string
          genres: string[] | null
          id: string
          interaction_strength: number
          interaction_type: string
          jambase_artist_id: string | null
          metadata: Json | null
          occurred_at: string
          popularity_score: number | null
          session_id: string | null
          source_entity_id: string | null
          source_entity_type: string | null
          spotify_artist_id: string | null
          user_id: string
        }
        Insert: {
          apple_music_artist_id?: string | null
          artist_id?: string | null
          artist_name: string
          created_at?: string
          genres?: string[] | null
          id?: string
          interaction_strength?: number
          interaction_type: string
          jambase_artist_id?: string | null
          metadata?: Json | null
          occurred_at?: string
          popularity_score?: number | null
          session_id?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          spotify_artist_id?: string | null
          user_id: string
        }
        Update: {
          apple_music_artist_id?: string | null
          artist_id?: string | null
          artist_name?: string
          created_at?: string
          genres?: string[] | null
          id?: string
          interaction_strength?: number
          interaction_type?: string
          jambase_artist_id?: string | null
          metadata?: Json | null
          occurred_at?: string
          popularity_score?: number | null
          session_id?: string | null
          source_entity_id?: string | null
          source_entity_type?: string | null
          spotify_artist_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_artist_interactions_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          block_reason: string | null
          blocked_user_id: string
          blocker_user_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          block_reason?: string | null
          blocked_user_id: string
          blocker_user_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          block_reason?: string | null
          blocked_user_id?: string
          blocker_user_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      user_events: {
        Row: {
          artist_id: string
          created_at: string
          description: string | null
          event_date: string
          event_name: string
          event_time: string | null
          id: string
          profile_id: string | null
          profile_user_id: string | null
          updated_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          description?: string | null
          event_date: string
          event_name: string
          event_time?: string | null
          id?: string
          profile_id?: string | null
          profile_user_id?: string | null
          updated_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          description?: string | null
          event_date?: string
          event_name?: string
          event_time?: string | null
          id?: string
          profile_id?: string | null
          profile_user_id?: string | null
          updated_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_events_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_user_events_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_events_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venue_events_view"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "user_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_genre_interactions: {
        Row: {
          artist_ids: string[] | null
          artist_names: string[] | null
          created_at: string
          genre: string
          id: string
          interaction_count: number
          interaction_type: string
          metadata: Json | null
          occurred_at: string
          source_entity_id: string | null
          source_entity_type: string | null
          subgenres: string[] | null
          user_id: string
        }
        Insert: {
          artist_ids?: string[] | null
          artist_names?: string[] | null
          created_at?: string
          genre: string
          id?: string
          interaction_count?: number
          interaction_type: string
          metadata?: Json | null
          occurred_at?: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          subgenres?: string[] | null
          user_id: string
        }
        Update: {
          artist_ids?: string[] | null
          artist_names?: string[] | null
          created_at?: string
          genre?: string
          id?: string
          interaction_count?: number
          interaction_type?: string
          metadata?: Json | null
          occurred_at?: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          subgenres?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      user_interactions: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string | null
          global_user_id: string | null
          id: string
          identity_issuer: string | null
          identity_sub: string | null
          metadata: Json | null
          occurred_at: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string | null
          global_user_id?: string | null
          id?: string
          identity_issuer?: string | null
          identity_sub?: string | null
          metadata?: Json | null
          occurred_at?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string | null
          global_user_id?: string | null
          id?: string
          identity_issuer?: string | null
          identity_sub?: string | null
          metadata?: Json | null
          occurred_at?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_jambase_events: {
        Row: {
          artist_genres: string[] | null
          artist_name: string | null
          checked_in_at: string | null
          created_at: string | null
          guest_count: number | null
          id: string
          jambase_event_id: string | null
          music_captured: boolean | null
          music_captured_at: string | null
          music_metadata: Json | null
          profile_id: string | null
          profile_user_id: string | null
          qr_code: string | null
          rsvp_status: string | null
          user_id: string | null
          venue_name: string | null
        }
        Insert: {
          artist_genres?: string[] | null
          artist_name?: string | null
          checked_in_at?: string | null
          created_at?: string | null
          guest_count?: number | null
          id?: string
          jambase_event_id?: string | null
          music_captured?: boolean | null
          music_captured_at?: string | null
          music_metadata?: Json | null
          profile_id?: string | null
          profile_user_id?: string | null
          qr_code?: string | null
          rsvp_status?: string | null
          user_id?: string | null
          venue_name?: string | null
        }
        Update: {
          artist_genres?: string[] | null
          artist_name?: string | null
          checked_in_at?: string | null
          created_at?: string | null
          guest_count?: number | null
          id?: string
          jambase_event_id?: string | null
          music_captured?: boolean | null
          music_captured_at?: string | null
          music_metadata?: Json | null
          profile_id?: string | null
          profile_user_id?: string | null
          qr_code?: string | null
          rsvp_status?: string | null
          user_id?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_jambase_events_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_jambase_events_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_jambase_events_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_user_jambase_events_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_jambase_events_jambase_event_id_fkey"
            columns: ["jambase_event_id"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_jambase_events_jambase_event_id_fkey"
            columns: ["jambase_event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_jambase_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_jambase_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
        ]
      }
      user_music_tags: {
        Row: {
          created_at: string | null
          id: string
          tag_source: string
          tag_type: string
          tag_value: string
          updated_at: string | null
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          tag_source?: string
          tag_type: string
          tag_value: string
          updated_at?: string | null
          user_id: string
          weight?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          tag_source?: string
          tag_type?: string
          tag_value?: string
          updated_at?: string | null
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
      user_reviews: {
        Row: {
          artist_id: string | null
          artist_names: string[] | null
          artist_rating: number | null
          artist_tags: string[] | null
          comments_count: number | null
          context_tags: string[] | null
          created_at: string
          custom_setlist: Json | null
          draft_data: Json | null
          event_id: string
          extracted_genres: string[] | null
          genre_tags: string[] | null
          id: string
          is_draft: boolean | null
          is_public: boolean | null
          last_saved_at: string | null
          likes_count: number | null
          mood_tags: string[] | null
          music_captured: boolean | null
          music_metadata: Json | null
          overall_experience_rating: number | null
          overall_experience_review_text: string | null
          performance_rating: number | null
          performance_review_text: string | null
          photos: string[] | null
          profile_id: string | null
          profile_user_id: string | null
          rank_order: number | null
          rating: number
          reaction_emoji: string | null
          review_text: string | null
          review_type: Database["public"]["Enums"]["review_type"] | null
          setlist: Json | null
          setlist_songs: string[] | null
          shares_count: number | null
          updated_at: string
          user_id: string
          venue_id: string | null
          venue_rating: number | null
          venue_rating_new: number | null
          venue_review_text: string | null
          venue_tags: string[] | null
          videos: string[] | null
          was_there: boolean | null
        }
        Insert: {
          artist_id?: string | null
          artist_names?: string[] | null
          artist_rating?: number | null
          artist_tags?: string[] | null
          comments_count?: number | null
          context_tags?: string[] | null
          created_at?: string
          custom_setlist?: Json | null
          draft_data?: Json | null
          event_id: string
          extracted_genres?: string[] | null
          genre_tags?: string[] | null
          id?: string
          is_draft?: boolean | null
          is_public?: boolean | null
          last_saved_at?: string | null
          likes_count?: number | null
          mood_tags?: string[] | null
          music_captured?: boolean | null
          music_metadata?: Json | null
          overall_experience_rating?: number | null
          overall_experience_review_text?: string | null
          performance_rating?: number | null
          performance_review_text?: string | null
          photos?: string[] | null
          profile_id?: string | null
          profile_user_id?: string | null
          rank_order?: number | null
          rating: number
          reaction_emoji?: string | null
          review_text?: string | null
          review_type?: Database["public"]["Enums"]["review_type"] | null
          setlist?: Json | null
          setlist_songs?: string[] | null
          shares_count?: number | null
          updated_at?: string
          user_id: string
          venue_id?: string | null
          venue_rating?: number | null
          venue_rating_new?: number | null
          venue_review_text?: string | null
          venue_tags?: string[] | null
          videos?: string[] | null
          was_there?: boolean | null
        }
        Update: {
          artist_id?: string | null
          artist_names?: string[] | null
          artist_rating?: number | null
          artist_tags?: string[] | null
          comments_count?: number | null
          context_tags?: string[] | null
          created_at?: string
          custom_setlist?: Json | null
          draft_data?: Json | null
          event_id?: string
          extracted_genres?: string[] | null
          genre_tags?: string[] | null
          id?: string
          is_draft?: boolean | null
          is_public?: boolean | null
          last_saved_at?: string | null
          likes_count?: number | null
          mood_tags?: string[] | null
          music_captured?: boolean | null
          music_metadata?: Json | null
          overall_experience_rating?: number | null
          overall_experience_review_text?: string | null
          performance_rating?: number | null
          performance_review_text?: string | null
          photos?: string[] | null
          profile_id?: string | null
          profile_user_id?: string | null
          rank_order?: number | null
          rating?: number
          reaction_emoji?: string | null
          review_text?: string | null
          review_type?: Database["public"]["Enums"]["review_type"] | null
          setlist?: Json | null
          setlist_songs?: string[] | null
          shares_count?: number | null
          updated_at?: string
          user_id?: string
          venue_id?: string | null
          venue_rating?: number | null
          venue_rating_new?: number | null
          venue_review_text?: string | null
          venue_tags?: string[] | null
          videos?: string[] | null
          was_there?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_reviews_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_reviews_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_reviews_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_user_reviews_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_reviews_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reviews_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reviews_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reviews_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venue_events_view"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "user_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_song_interactions: {
        Row: {
          album_name: string | null
          artist_ids: string[] | null
          artist_names: string[] | null
          created_at: string
          duration_ms: number | null
          genres: string[] | null
          id: string
          interaction_type: string
          metadata: Json | null
          occurred_at: string
          played_at: string | null
          popularity_score: number | null
          song_id: string
          song_name: string
          source_entity_id: string | null
          source_entity_type: string | null
          user_id: string
        }
        Insert: {
          album_name?: string | null
          artist_ids?: string[] | null
          artist_names?: string[] | null
          created_at?: string
          duration_ms?: number | null
          genres?: string[] | null
          id?: string
          interaction_type: string
          metadata?: Json | null
          occurred_at?: string
          played_at?: string | null
          popularity_score?: number | null
          song_id: string
          song_name: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          user_id: string
        }
        Update: {
          album_name?: string | null
          artist_ids?: string[] | null
          artist_names?: string[] | null
          created_at?: string
          duration_ms?: number | null
          genres?: string[] | null
          id?: string
          interaction_type?: string
          metadata?: Json | null
          occurred_at?: string
          played_at?: string | null
          popularity_score?: number | null
          song_id?: string
          song_name?: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_swipes: {
        Row: {
          created_at: string
          event_artist_name: string | null
          event_genres: string[] | null
          event_id: number
          event_uuid: string | null
          id: string
          is_interested: boolean
          music_context: Json | null
          swiped_profile_id: string | null
          swiped_profile_user_id: string | null
          swiped_user_id: string
          swiper_profile_id: string | null
          swiper_profile_user_id: string | null
          swiper_user_id: string
        }
        Insert: {
          created_at?: string
          event_artist_name?: string | null
          event_genres?: string[] | null
          event_id: number
          event_uuid?: string | null
          id?: string
          is_interested: boolean
          music_context?: Json | null
          swiped_profile_id?: string | null
          swiped_profile_user_id?: string | null
          swiped_user_id: string
          swiper_profile_id?: string | null
          swiper_profile_user_id?: string | null
          swiper_user_id: string
        }
        Update: {
          created_at?: string
          event_artist_name?: string | null
          event_genres?: string[] | null
          event_id?: number
          event_uuid?: string | null
          id?: string
          is_interested?: boolean
          music_context?: Json | null
          swiped_profile_id?: string | null
          swiped_profile_user_id?: string | null
          swiped_user_id?: string
          swiper_profile_id?: string | null
          swiper_profile_user_id?: string | null
          swiper_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_swipes_event_uuid"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_swipes_event_uuid"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_swipes_swiped_profile"
            columns: ["swiped_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_swipes_swiped_profile"
            columns: ["swiped_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_swipes_swiped_profile_user"
            columns: ["swiped_profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_user_swipes_swiped_profile_user"
            columns: ["swiped_profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_user_swipes_swiper_profile"
            columns: ["swiper_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_swipes_swiper_profile"
            columns: ["swiper_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_swipes_swiper_profile_user"
            columns: ["swiper_profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_user_swipes_swiper_profile_user"
            columns: ["swiper_profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_swipes_swiped_profile_id_fkey"
            columns: ["swiped_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_swipes_swiped_profile_id_fkey"
            columns: ["swiped_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_swipes_swiper_profile_id_fkey"
            columns: ["swiper_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_swipes_swiper_profile_id_fkey"
            columns: ["swiper_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
        ]
      }
      user_venue_interactions: {
        Row: {
          artists_seen_here: string[] | null
          created_at: string
          event_count_at_venue: number | null
          id: string
          interaction_strength: number
          interaction_type: string
          metadata: Json | null
          occurred_at: string
          source_entity_id: string | null
          source_entity_type: string | null
          typical_genres: string[] | null
          user_id: string
          venue_id: string | null
          venue_name: string
        }
        Insert: {
          artists_seen_here?: string[] | null
          created_at?: string
          event_count_at_venue?: number | null
          id?: string
          interaction_strength?: number
          interaction_type: string
          metadata?: Json | null
          occurred_at?: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          typical_genres?: string[] | null
          user_id: string
          venue_id?: string | null
          venue_name: string
        }
        Update: {
          artists_seen_here?: string[] | null
          created_at?: string
          event_count_at_venue?: number | null
          id?: string
          interaction_strength?: number
          interaction_type?: string
          metadata?: Json | null
          occurred_at?: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          typical_genres?: string[] | null
          user_id?: string
          venue_id?: string | null
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_venue_interactions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venue_events_view"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "user_venue_interactions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_venues: {
        Row: {
          created_at: string
          id: string
          profile_id: string | null
          profile_user_id: string | null
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id?: string | null
          profile_user_id?: string | null
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string | null
          profile_user_id?: string | null
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_venues_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fk_user_venues_profile_user"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_venues_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_venues_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_with_account_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_venues_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venue_events_view"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "user_venues_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_follows: {
        Row: {
          created_at: string
          id: string
          music_captured: boolean | null
          music_metadata: Json | null
          updated_at: string
          user_id: string
          venue_city: string | null
          venue_name: string
          venue_state: string | null
          venue_typical_genres: string[] | null
        }
        Insert: {
          created_at?: string
          id?: string
          music_captured?: boolean | null
          music_metadata?: Json | null
          updated_at?: string
          user_id: string
          venue_city?: string | null
          venue_name: string
          venue_state?: string | null
          venue_typical_genres?: string[] | null
        }
        Update: {
          created_at?: string
          id?: string
          music_captured?: boolean | null
          music_metadata?: Json | null
          updated_at?: string
          user_id?: string
          venue_city?: string | null
          venue_name?: string
          venue_state?: string | null
          venue_typical_genres?: string[] | null
        }
        Relationships: []
      }
      venues: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string
          date_modified: string | null
          date_published: string | null
          id: string
          identifier: string
          image_url: string | null
          is_user_created: boolean | null
          jambase_venue_id: string
          last_synced_at: string | null
          latitude: number | null
          longitude: number | null
          maximum_attendee_capacity: number | null
          name: string
          same_as: string[] | null
          state: string | null
          updated_at: string
          url: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_modified?: string | null
          date_published?: string | null
          id?: string
          identifier: string
          image_url?: string | null
          is_user_created?: boolean | null
          jambase_venue_id: string
          last_synced_at?: string | null
          latitude?: number | null
          longitude?: number | null
          maximum_attendee_capacity?: number | null
          name: string
          same_as?: string[] | null
          state?: string | null
          updated_at?: string
          url?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_modified?: string | null
          date_published?: string | null
          id?: string
          identifier?: string
          image_url?: string | null
          is_user_created?: boolean | null
          jambase_venue_id?: string
          last_synced_at?: string | null
          latitude?: number | null
          longitude?: number | null
          maximum_attendee_capacity?: number | null
          name?: string
          same_as?: string[] | null
          state?: string | null
          updated_at?: string
          url?: string | null
          zip?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      artist_follows_with_details: {
        Row: {
          artist_id: string | null
          artist_image_url: string | null
          artist_name: string | null
          created_at: string | null
          genres: string[] | null
          id: string | null
          jambase_artist_id: string | null
          num_upcoming_events: number | null
          user_avatar_url: string | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_profile_summary: {
        Row: {
          artist_type: string | null
          band_or_musician: string | null
          created_at: string | null
          founding_date: string | null
          founding_location: string | null
          genres: string[] | null
          id: string | null
          identifier: string | null
          image_url: string | null
          jambase_artist_id: string | null
          last_synced_at: string | null
          name: string | null
          num_upcoming_events: number | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          artist_type?: string | null
          band_or_musician?: string | null
          created_at?: string | null
          founding_date?: string | null
          founding_location?: string | null
          genres?: string[] | null
          id?: string | null
          identifier?: string | null
          image_url?: string | null
          jambase_artist_id?: string | null
          last_synced_at?: string | null
          name?: string | null
          num_upcoming_events?: number | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          artist_type?: string | null
          band_or_musician?: string | null
          created_at?: string | null
          founding_date?: string | null
          founding_location?: string | null
          genres?: string[] | null
          id?: string | null
          identifier?: string | null
          image_url?: string | null
          jambase_artist_id?: string | null
          last_synced_at?: string | null
          name?: string | null
          num_upcoming_events?: number | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
      events_with_setlists: {
        Row: {
          artist_id: string | null
          artist_name: string | null
          artist_uuid: string | null
          created_at: string | null
          description: string | null
          doors_time: string | null
          event_date: string | null
          event_status: string | null
          genres: string[] | null
          id: string | null
          is_user_created: boolean | null
          jambase_event_id: string | null
          latitude: number | null
          longitude: number | null
          price_range: string | null
          setlist: Json | null
          setlist_enriched: boolean | null
          setlist_fm_id: string | null
          setlist_fm_url: string | null
          setlist_last_updated: string | null
          setlist_song_count: number | null
          setlist_source: string | null
          setlist_status: string | null
          ticket_available: boolean | null
          ticket_urls: string[] | null
          title: string | null
          tour_name: string | null
          updated_at: string | null
          venue_address: string | null
          venue_city: string | null
          venue_id: string | null
          venue_name: string | null
          venue_state: string | null
          venue_zip: string | null
        }
        Insert: {
          artist_id?: string | null
          artist_name?: string | null
          artist_uuid?: string | null
          created_at?: string | null
          description?: string | null
          doors_time?: string | null
          event_date?: string | null
          event_status?: never
          genres?: string[] | null
          id?: string | null
          is_user_created?: boolean | null
          jambase_event_id?: string | null
          latitude?: number | null
          longitude?: number | null
          price_range?: string | null
          setlist?: Json | null
          setlist_enriched?: boolean | null
          setlist_fm_id?: string | null
          setlist_fm_url?: string | null
          setlist_last_updated?: string | null
          setlist_song_count?: number | null
          setlist_source?: string | null
          setlist_status?: never
          ticket_available?: boolean | null
          ticket_urls?: string[] | null
          title?: string | null
          tour_name?: string | null
          updated_at?: string | null
          venue_address?: string | null
          venue_city?: string | null
          venue_id?: string | null
          venue_name?: string | null
          venue_state?: string | null
          venue_zip?: string | null
        }
        Update: {
          artist_id?: string | null
          artist_name?: string | null
          artist_uuid?: string | null
          created_at?: string | null
          description?: string | null
          doors_time?: string | null
          event_date?: string | null
          event_status?: never
          genres?: string[] | null
          id?: string | null
          is_user_created?: boolean | null
          jambase_event_id?: string | null
          latitude?: number | null
          longitude?: number | null
          price_range?: string | null
          setlist?: Json | null
          setlist_enriched?: boolean | null
          setlist_fm_id?: string | null
          setlist_fm_url?: string | null
          setlist_last_updated?: string | null
          setlist_song_count?: number | null
          setlist_source?: string | null
          setlist_status?: never
          ticket_available?: boolean | null
          ticket_urls?: string[] | null
          title?: string | null
          tour_name?: string | null
          updated_at?: string | null
          venue_address?: string | null
          venue_city?: string | null
          venue_id?: string | null
          venue_name?: string | null
          venue_state?: string | null
          venue_zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jambase_events_artist_uuid_fkey"
            columns: ["artist_uuid"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_with_details: {
        Row: {
          actor_avatar: string | null
          actor_name: string | null
          actor_user_id: string | null
          artist_name: string | null
          comment_id: string | null
          created_at: string | null
          data: Json | null
          event_title: string | null
          id: string | null
          is_read: boolean | null
          message: string | null
          rating: number | null
          review_id: string | null
          review_text: string | null
          title: string | null
          type: string | null
          user_id: string | null
          venue_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "review_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "public_reviews_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "user_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_with_account_info: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"] | null
          avatar_url: string | null
          bio: string | null
          birthday: string | null
          business_info: Json | null
          created_at: string | null
          gender: string | null
          id: string | null
          instagram_handle: string | null
          is_public_profile: boolean | null
          last_active_at: string | null
          music_streaming_profile: string | null
          name: string | null
          permissions: string[] | null
          similar_users_notifications: boolean | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_active: boolean | null
          subscription_expires_at: string | null
          subscription_started_at: string | null
          subscription_tier:
            | Database["public"]["Enums"]["subscription_tier"]
            | null
          updated_at: string | null
          user_id: string | null
          verification_level:
            | Database["public"]["Enums"]["verification_level"]
            | null
          verified: boolean | null
        }
        Relationships: []
      }
      public_reviews_with_profiles: {
        Row: {
          artist_name: string | null
          artist_rating: number | null
          artist_tags: string[] | null
          comments_count: number | null
          context_tags: string[] | null
          created_at: string | null
          event_date: string | null
          event_id: string | null
          event_title: string | null
          genre_tags: string[] | null
          id: string | null
          likes_count: number | null
          mood_tags: string[] | null
          overall_experience_rating: number | null
          performance_rating: number | null
          photos: string[] | null
          rating: number | null
          reaction_emoji: string | null
          review_text: string | null
          review_type: Database["public"]["Enums"]["review_type"] | null
          reviewer_avatar: string | null
          reviewer_name: string | null
          shares_count: number | null
          updated_at: string | null
          user_id: string | null
          venue_id: string | null
          venue_name: string | null
          venue_rating: number | null
          venue_tags: string[] | null
          videos: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "user_reviews_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_with_setlists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reviews_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "jambase_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venue_events_view"
            referencedColumns: ["venue_id"]
          },
          {
            foreignKeyName: "user_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_events_view: {
        Row: {
          city: string | null
          country: string | null
          latitude: number | null
          longitude: number | null
          state: string | null
          total_events: number | null
          upcoming_events: number | null
          venue_id: string | null
          venue_name: string | null
        }
        Relationships: []
      }
      venue_follows_with_details: {
        Row: {
          created_at: string | null
          id: string | null
          user_avatar_url: string | null
          user_id: string | null
          user_name: string | null
          venue_city: string | null
          venue_name: string | null
          venue_state: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_friend_request: {
        Args: { request_id: string }
        Returns: undefined
      }
      admin_review_upgrade_request: {
        Args: {
          p_denial_reason?: string
          p_request_id: string
          p_status: string
        }
        Returns: undefined
      }
      admin_set_account_type: {
        Args: {
          p_account_type: Database["public"]["Enums"]["account_type"]
          p_subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          p_user_id: string
          p_verification_level?: Database["public"]["Enums"]["verification_level"]
        }
        Returns: undefined
      }
      backfill_setlist_data: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      block_user: {
        Args: { p_block_reason?: string; p_blocked_user_id: string }
        Returns: string
      }
      calculate_distance: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      calculate_event_relevance_score: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: number
      }
      claim_event: {
        Args: {
          p_claim_reason: string
          p_event_id: string
          p_verification_proof?: string
        }
        Returns: string
      }
      create_direct_chat: {
        Args: { user1_id: string; user2_id: string }
        Returns: string
      }
      create_event_group: {
        Args: {
          p_description?: string
          p_event_id: string
          p_is_public?: boolean
          p_max_members?: number
          p_name: string
        }
        Returns: string
      }
      create_friend_request: {
        Args: { receiver_user_id: string }
        Returns: string
      }
      create_group_chat: {
        Args: { admin_id: string; chat_name: string; user_ids: string[] }
        Returns: string
      }
      decline_friend_request: {
        Args: { request_id: string }
        Returns: undefined
      }
      delete_review_draft: {
        Args: { p_draft_id: string; p_user_id: string }
        Returns: boolean
      }
      flag_content: {
        Args: {
          p_content_id: string
          p_content_type: string
          p_flag_details?: string
          p_flag_reason: string
        }
        Returns: string
      }
      get_artist_events: {
        Args: { artist_uuid: string; limit_count?: number }
        Returns: {
          event_date: string
          event_id: string
          event_title: string
          venue_city: string
          venue_name: string
          venue_state: string
        }[]
      }
      get_artist_follower_count: {
        Args: { p_artist_id: string }
        Returns: number
      }
      get_blocked_users: {
        Args: Record<PropertyKey, never>
        Returns: {
          block_id: string
          block_reason: string
          blocked_at: string
          blocked_user_avatar_url: string
          blocked_user_id: string
          blocked_user_name: string
        }[]
      }
      get_chat_participants: {
        Args: { chat_id_param: string }
        Returns: {
          avatar_url: string
          joined_at: string
          name: string
          role: string
          user_id: string
        }[]
      }
      get_claimed_events: {
        Args: { p_user_id?: string }
        Returns: {
          artist_name: string
          claimed_at: string
          event_date: string
          event_status: string
          id: string
          media_urls: string[]
          poster_image_url: string
          title: string
          venue_name: string
        }[]
      }
      get_connection_degree: {
        Args: { current_user_id: string; target_user_id: string }
        Returns: number
      }
      get_connection_info: {
        Args: { current_user_id: string; target_user_id: string }
        Returns: {
          color: string
          degree: number
          label: string
          mutual_friends_count: number
        }[]
      }
      get_event_groups: {
        Args: { p_event_id: string }
        Returns: {
          cover_image_url: string
          created_at: string
          created_by_user_id: string
          creator_avatar_url: string
          creator_name: string
          description: string
          id: string
          is_member: boolean
          is_public: boolean
          max_members: number
          member_count: number
          name: string
        }[]
      }
      get_event_interest_count: {
        Args: { event_uuid: string }
        Returns: number
      }
      get_event_photos: {
        Args: { p_event_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          caption: string
          comments_count: number
          created_at: string
          id: string
          is_featured: boolean
          likes_count: number
          photo_url: string
          user_avatar_url: string
          user_has_liked: boolean
          user_id: string
          user_name: string
        }[]
      }
      get_events_by_status: {
        Args: {
          artist_name_filter?: string
          limit_count?: number
          offset_count?: number
          status_filter?: string
        }
        Returns: {
          artist_name: string
          event_date: string
          event_status: string
          id: string
          setlist: Json
          setlist_enriched: boolean
          setlist_song_count: number
          setlist_source: string
          title: string
          venue_name: string
        }[]
      }
      get_events_near_city: {
        Args: {
          radius_miles?: number
          search_city: string
          search_state?: string
        }
        Returns: {
          artist_id: string
          artist_name: string
          created_at: string
          description: string
          distance_miles: number
          doors_time: string
          event_date: string
          genres: string[]
          id: string
          jambase_event_id: string
          latitude: number
          longitude: number
          price_range: string
          setlist: Json
          ticket_available: boolean
          ticket_urls: string[]
          title: string
          tour_name: string
          updated_at: string
          venue_address: string
          venue_city: string
          venue_id: string
          venue_name: string
          venue_state: string
          venue_zip: string
        }[]
      }
      get_events_near_zip_improved: {
        Args: { radius_miles?: number; search_zip: string }
        Returns: {
          artist_id: string
          artist_name: string
          created_at: string
          description: string
          distance_miles: number
          doors_time: string
          event_date: string
          genres: string[]
          id: string
          jambase_event_id: string
          latitude: number
          longitude: number
          price_range: string
          setlist: Json
          ticket_available: boolean
          ticket_urls: string[]
          title: string
          tour_name: string
          updated_at: string
          venue_address: string
          venue_city: string
          venue_id: string
          venue_name: string
          venue_state: string
          venue_zip: string
        }[]
      }
      get_fully_diversified_feed: {
        Args: {
          p_diversity_weight?: number
          p_limit?: number
          p_max_per_artist?: number
          p_max_per_genre?: number
          p_max_per_venue_type?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: {
          artist_frequency_rank: number
          diversity_penalties: Json
          event_id: string
          final_relevance_score: number
          genre_diversity_bonus: number
          recommendation_explanation: string
          venue_type: string
        }[]
      }
      get_genre_diversified_feed: {
        Args: {
          p_genre_variety_bonus?: number
          p_limit?: number
          p_max_per_genre?: number
          p_user_id: string
        }
        Returns: {
          event_id: string
          genre_diversity_bonus: number
          genre_rank: number
          relevance_score: number
        }[]
      }
      get_pending_admin_tasks: {
        Args: Record<PropertyKey, never>
        Returns: {
          oldest_task_date: string
          task_count: number
          task_type: string
        }[]
      }
      get_pending_flags_simple: {
        Args: Record<PropertyKey, never>
        Returns: {
          action_taken: string
          content_id: string
          content_type: string
          created_at: string
          flag_details: string
          flag_reason: string
          flag_status: string
          flagged_by_user_id: string
          flagger_avatar_url: string
          flagger_name: string
          id: string
          review_notes: string
          reviewed_at: string
          reviewed_by_admin_id: string
          updated_at: string
        }[]
      }
      get_personalized_events_feed: {
        Args: {
          p_include_past?: boolean
          p_limit?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: {
          artist_id: string
          artist_name: string
          created_at: string
          description: string
          doors_time: string
          event_date: string
          event_id: string
          friends_interested_count: number
          genres: string[]
          interested_count: number
          jambase_event_id: string
          latitude: number
          longitude: number
          price_range: string
          relevance_score: number
          setlist: Json
          setlist_enriched: boolean
          setlist_fm_id: string
          setlist_fm_url: string
          setlist_last_updated: string
          setlist_song_count: number
          setlist_source: string
          ticket_available: boolean
          ticket_urls: string[]
          title: string
          tour_name: string
          updated_at: string
          user_is_interested: boolean
          venue_address: string
          venue_city: string
          venue_id: string
          venue_name: string
          venue_state: string
          venue_zip: string
        }[]
      }
      get_personalized_events_feed_with_diversity: {
        Args: {
          p_include_past?: boolean
          p_limit?: number
          p_max_per_artist?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: {
          artist_frequency_rank: number
          artist_id: string
          artist_name: string
          created_at: string
          description: string
          diversity_penalty: number
          doors_time: string
          event_date: string
          event_id: string
          friends_interested_count: number
          genres: string[]
          interested_count: number
          jambase_event_id: string
          latitude: number
          longitude: number
          price_range: string
          relevance_score: number
          setlist: Json
          setlist_enriched: boolean
          setlist_fm_id: string
          setlist_fm_url: string
          setlist_last_updated: string
          setlist_song_count: number
          setlist_source: string
          ticket_available: boolean
          ticket_urls: string[]
          title: string
          tour_name: string
          updated_at: string
          user_is_interested: boolean
          venue_address: string
          venue_city: string
          venue_id: string
          venue_name: string
          venue_state: string
          venue_zip: string
        }[]
      }
      get_review_engagement: {
        Args: { review_id_param: string; user_id_param?: string }
        Returns: {
          comments_count: number
          is_liked_by_user: boolean
          likes_count: number
          shares_count: number
        }[]
      }
      get_unread_notification_count: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_user_account_info: {
        Args: { p_user_id: string }
        Returns: {
          account_type: Database["public"]["Enums"]["account_type"]
          permissions: string[]
          subscription_active: boolean
          subscription_tier: Database["public"]["Enums"]["subscription_tier"]
          verification_level: Database["public"]["Enums"]["verification_level"]
          verified: boolean
        }[]
      }
      get_user_chats: {
        Args: { user_id: string }
        Returns: {
          chat_name: string
          created_at: string
          group_admin_id: string
          id: string
          is_group_chat: boolean
          latest_message: string
          latest_message_created_at: string
          latest_message_id: string
          latest_message_sender_name: string
          updated_at: string
          users: string[]
        }[]
      }
      get_user_created_events: {
        Args: { p_user_id?: string }
        Returns: {
          artist_name: string
          created_at: string
          event_date: string
          event_status: string
          id: string
          media_urls: string[]
          poster_image_url: string
          title: string
          venue_name: string
        }[]
      }
      get_user_draft_reviews: {
        Args: { p_user_id: string }
        Returns: {
          artist_name: string
          draft_data: Json
          event_date: string
          event_id: string
          event_title: string
          id: string
          last_saved_at: string
          venue_name: string
        }[]
      }
      get_user_interested_events: {
        Args: { target_user_id: string }
        Returns: {
          artist_name: string
          created_at: string
          description: string
          doors_time: string
          event_date: string
          genres: string[]
          id: string
          price_range: string
          ticket_available: boolean
          ticket_urls: string[]
          title: string
          venue_city: string
          venue_name: string
          venue_state: string
        }[]
      }
      get_user_music_profile_summary: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_user_reviews_by_rating: {
        Args: { p_rating: number; p_user_id: string }
        Returns: {
          artist_name: string
          created_at: string
          event_date: string
          event_id: string
          event_title: string
          id: string
          overall_experience_rating: number
          performance_rating: number
          rank_order: number
          rating: number
          review_text: string
          venue_name: string
          venue_rating_new: number
        }[]
      }
      get_user_top_artists: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          artist_id: string
          artist_name: string
          genres: string[]
          interaction_count: number
          score: number
        }[]
      }
      get_user_top_genres: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          genre: string
          interaction_count: number
          score: number
        }[]
      }
      get_users_interested_in_event: {
        Args: { event_id: string }
        Returns: {
          avatar_url: string
          bio: string
          created_at: string
          instagram_handle: string
          name: string
          snapchat_handle: string
          updated_at: string
          user_id: string
        }[]
      }
      get_venue_diversified_feed: {
        Args: {
          p_limit?: number
          p_max_per_venue_type?: number
          p_user_id: string
        }
        Returns: {
          event_id: string
          relevance_score: number
          venue_type: string
          venue_type_rank: number
        }[]
      }
      get_venue_events: {
        Args: { limit_count?: number; venue_uuid: string }
        Returns: {
          artist_name: string
          event_date: string
          event_id: string
          event_title: string
          venue_city: string
          venue_state: string
        }[]
      }
      get_venue_follower_count: {
        Args: {
          p_venue_city: string
          p_venue_name: string
          p_venue_state: string
        }
        Returns: number
      }
      get_zips_near_city: {
        Args: {
          radius_miles?: number
          search_city: string
          search_state?: string
        }
        Returns: {
          city: string
          distance_miles: number
          latitude: number
          longitude: number
          state: string
          zip_code: string
        }[]
      }
      is_following_artist: {
        Args: { p_artist_id: string; p_user_id: string }
        Returns: boolean
      }
      is_following_venue: {
        Args: {
          p_user_id: string
          p_venue_city: string
          p_venue_name: string
          p_venue_state: string
        }
        Returns: boolean
      }
      is_user_blocked: {
        Args: { p_by_user_id?: string; p_user_id: string }
        Returns: boolean
      }
      is_user_interested: {
        Args: { event_uuid: string }
        Returns: boolean
      }
      join_event_group: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      leave_event_group: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      log_user_interaction: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_metadata?: Json
          p_session_id?: string
        }
        Returns: string
      }
      log_user_interactions_batch: {
        Args: { p_interactions: Json }
        Returns: string[]
      }
      mark_all_notifications_read: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      mark_notification_read: {
        Args: { notification_id: string }
        Returns: undefined
      }
      moderate_content: {
        Args: {
          p_action: string
          p_flag_id: string
          p_notify_user?: boolean
          p_review_notes?: string
        }
        Returns: undefined
      }
      populate_artist_venue_uuids: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      populate_events_from_concerts: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      populate_review_artist_ids: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      populate_review_venue_ids: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      promote_event: {
        Args: {
          p_event_id: string
          p_expires_at: string
          p_promotion_tier: string
          p_starts_at: string
          p_target_cities?: string[]
          p_target_genres?: string[]
        }
        Returns: string
      }
      publish_review_draft: {
        Args: { p_draft_id: string; p_final_data: Json; p_is_public?: boolean }
        Returns: string
      }
      review_event_claim: {
        Args: {
          p_admin_notes?: string
          p_approved: boolean
          p_claim_id: string
        }
        Returns: undefined
      }
      review_event_promotion: {
        Args: {
          p_admin_notes?: string
          p_approved: boolean
          p_promotion_id: string
          p_rejection_reason?: string
        }
        Returns: undefined
      }
      save_review_draft: {
        Args: { p_draft_data: Json; p_event_id: string; p_user_id: string }
        Returns: string
      }
      set_artist_follow: {
        Args: { p_artist_id: string; p_following: boolean }
        Returns: undefined
      }
      set_user_interest: {
        Args: { event_id: string; interested: boolean }
        Returns: undefined
      }
      set_venue_follow: {
        Args: {
          p_following: boolean
          p_venue_city: string
          p_venue_name: string
          p_venue_state: string
        }
        Returns: undefined
      }
      toggle_event_interest: {
        Args: { event_uuid: string }
        Returns: Json
      }
      unblock_user: {
        Args: { p_blocked_user_id: string }
        Returns: undefined
      }
      unfriend_user: {
        Args: { friend_user_id: string }
        Returns: undefined
      }
      update_rsvp_status: {
        Args: {
          p_event_id: string
          p_guest_count?: number
          p_rsvp_status: string
        }
        Returns: undefined
      }
      update_user_last_active: {
        Args: { user_id_param: string }
        Returns: undefined
      }
      user_has_permission: {
        Args: { p_permission_key: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      account_type: "user" | "creator" | "business" | "admin"
      flag_status_enum: "pending" | "resolved" | "dismissed"
      moderation_entity_type_enum: "event" | "review" | "profile" | "comment"
      moderation_flag_type_enum:
        | "spam"
        | "inappropriate_content"
        | "harassment_bullying"
        | "false_information"
        | "copyright_violation"
        | "fake_fraudulent_event"
      review_type: "event" | "venue" | "artist"
      subscription_tier: "free" | "premium" | "professional" | "enterprise"
      verification_level: "none" | "email" | "phone" | "identity" | "business"
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
    Enums: {
      account_type: ["user", "creator", "business", "admin"],
      flag_status_enum: ["pending", "resolved", "dismissed"],
      moderation_entity_type_enum: ["event", "review", "profile", "comment"],
      moderation_flag_type_enum: [
        "spam",
        "inappropriate_content",
        "harassment_bullying",
        "false_information",
        "copyright_violation",
        "fake_fraudulent_event",
      ],
      review_type: ["event", "venue", "artist"],
      subscription_tier: ["free", "premium", "professional", "enterprise"],
      verification_level: ["none", "email", "phone", "identity", "business"],
    },
  },
} as const
