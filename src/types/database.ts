// Database type definitions for consolidated tables
// Updated to match the new 15-table consolidated schema

// ============================================
// 1. USERS TABLE (core identity and profile)
// ============================================
// Note: Verification and subscription data moved to separate tables
// for domain separation. Use JOINs or compatibility views.
export interface User {
  id: string; // UUID
  user_id: string; // UUID - references auth.users(id)
  username: string | null; // TEXT
  name: string;
  avatar_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  music_streaming_profile: string | null;
  gender: string | null;
  birthday: string | null; // DATE
  account_type: 'user' | 'creator' | 'business' | 'admin';
  business_info: Record<string, any> | null; // JSONB
  is_public_profile: boolean;
  similar_users_notifications: boolean;
  moderation_status: 'good_standing' | 'warned' | 'restricted' | 'suspended' | 'banned';
  warning_count: number;
  last_warned_at: string | null; // TIMESTAMPTZ
  suspended_until: string | null; // TIMESTAMPTZ
  ban_reason: string | null;
  last_active_at: string | null; // TIMESTAMPTZ
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
  // Apple Sign In fields
  apple_user_id?: string | null; // TEXT - Apple Sign In user identifier (sub claim), unique identifier for Apple-authenticated users
  email?: string | null; // TEXT - Email provided by Apple identity provider (identity metadata only, not unique, not used for authentication)
  // Metadata columns
  permissions_metadata?: Record<string, any>; // JSONB
  waitlist_signup_at?: string | null; // TIMESTAMPTZ
  waitlist_metadata?: Record<string, any>; // JSONB
  admin_actions_log?: any[]; // JSONB
}

// ============================================
// 1a. USER_VERIFICATIONS TABLE
// ============================================
export interface UserVerification {
  user_id: string; // UUID - PRIMARY KEY, references users(user_id)
  verified: boolean;
  verification_level: 'none' | 'email' | 'phone' | 'id' | 'premium';
  verified_at: string | null; // TIMESTAMPTZ
  verified_by: string | null; // UUID - references users(user_id)
  trust_score: number | null;
  verification_criteria_met: Record<string, any> | null; // JSONB
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

// ============================================
// 1b. USER_SUBSCRIPTIONS TABLE
// ============================================
export interface UserSubscription {
  user_id: string; // UUID - PRIMARY KEY, references users(user_id)
  subscription_tier: 'free' | 'premium' | 'professional' | 'enterprise';
  status: 'active' | 'past_due' | 'cancelled' | 'expired' | 'trialing';
  subscription_started_at: string | null; // TIMESTAMPTZ
  subscription_expires_at: string | null; // TIMESTAMPTZ
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  metadata: Record<string, any> | null; // JSONB
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

// ============================================
// 1c. USER WITH VERIFICATION/SUBSCRIPTION (for JOINs)
// ============================================
export interface UserWithRelations extends User {
  verification?: UserVerification | null;
  subscription?: UserSubscription | null;
}

// Legacy alias for backward compatibility
export type Profile = User;

// ============================================
// 2. EVENTS TABLE (from jambase_events + promotions)
// ============================================
export interface Event {
  id: string; // UUID
  jambase_event_id: string | null;
  ticketmaster_event_id: string | null;
  title: string;
  artist_name: string;
  artist_id: string | null; // JamBase artist ID (preferred for queries/matching)
  artist_uuid: string | null; // UUID - references artists(id) - for foreign keys only
  venue_name: string;
  venue_id: string | null; // JamBase venue ID (preferred for queries/matching)
  venue_uuid: string | null; // UUID - references venues(id) - for foreign keys only
  event_date: string; // TIMESTAMPTZ
  doors_time: string | null; // TIMESTAMPTZ
  description: string | null;
  genres: string[] | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_zip: string | null;
  latitude: number | null;
  longitude: number | null;
  ticket_available: boolean;
  price_range: string | null;
  price_min: number | null;
  price_max: number | null;
  price_currency: string;
  ticket_urls: string[] | null;
  external_url: string | null;
  setlist: any | null; // JSONB
  setlist_enriched: boolean;
  setlist_song_count: number | null;
  setlist_fm_id: string | null;
  setlist_fm_url: string | null;
  setlist_source: string | null;
  setlist_last_updated: string | null; // TIMESTAMPTZ
  tour_name: string | null;
  source: 'jambase' | 'ticketmaster' | 'manual';
  event_status: string | null;
  classifications: any | null; // JSONB
  sales_info: any | null; // JSONB
  attraction_ids: string[] | null;
  venue_timezone: string | null;
  images: any | null; // JSONB
  poster_image_url: string | null;
  is_user_created: boolean;
  // Promotion fields
  promoted: boolean;
  promotion_tier: 'basic' | 'premium' | 'featured' | null;
  promotion_start_date: string | null; // TIMESTAMPTZ
  promotion_end_date: string | null; // TIMESTAMPTZ
  is_featured: boolean;
  featured_until: string | null; // TIMESTAMPTZ
  // Ownership
  created_by_user_id: string | null; // UUID - references users(user_id)
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

// Legacy alias for backward compatibility
export type JamBaseEvent = Event;

// ============================================
// 3. ARTISTS TABLE (from artists + artist_profile)
// ============================================
export interface Artist {
  id: string; // UUID
  jambase_artist_id: string;
  artist_data_source: string;
  name: string;
  identifier: string;
  url: string | null;
  image_url: string | null;
  date_published: string | null; // TIMESTAMPTZ
  date_modified: string | null; // TIMESTAMPTZ
  artist_type: 'MusicGroup' | 'Person' | null;
  band_or_musician: 'band' | 'musician' | null;
  founding_location: string | null;
  founding_date: string | null;
  genres: string[] | null;
  members: any | null; // JSONB
  member_of: any | null; // JSONB
  external_identifiers: any | null; // JSONB
  same_as: any | null; // JSONB
  num_upcoming_events: number;
  raw_jambase_data: any | null; // JSONB
  // Ownership fields
  owner_user_id: string | null; // UUID - references users(user_id)
  verified: boolean;
  claimed_at: string | null; // TIMESTAMPTZ
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
  last_synced_at: string | null; // TIMESTAMPTZ
}

// ============================================
// 4. VENUES TABLE (from venues + venue_profile)
// ============================================
export interface Venue {
  id: string; // UUID
  jambase_venue_id: string | null;
  name: string;
  identifier: string | null;
  address: any | null; // JSONB
  geo: any | null; // JSONB
  maximum_attendee_capacity: number | null;
  num_upcoming_events: number;
  image_url: string | null;
  url: string | null;
  same_as: string[] | null;
  date_published: string | null; // TIMESTAMPTZ
  date_modified: string | null; // TIMESTAMPTZ
  last_synced_at: string | null; // TIMESTAMPTZ
  // Ownership fields
  owner_user_id: string | null; // UUID - references users(user_id)
  verified: boolean;
  claimed_at: string | null; // TIMESTAMPTZ
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

// ============================================
// 5. RELATIONSHIPS TABLES (3NF-compliant domain-specific tables)
// ============================================

// User-Event Relationships (3NF compliant)
export interface UserEventRelationship {
  user_id: string; // UUID - references users(user_id)
  event_id: string; // UUID - references events(id)
  relationship_type: 'going' | 'interested' | 'maybe' | 'not_going';
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

// Legacy polymorphic relationship table (deprecated for events - use UserEventRelationship)
export interface Relationship {
  id: string; // UUID
  user_id: string; // UUID - references users(user_id)
  related_entity_type: 'user' | 'artist' | 'venue' | 'event';
  related_entity_id: string; // Can be UUID or text (for venue names)
  relationship_type: 'follow' | 'interest' | 'friend' | 'match' | 'block' | 'going' | 'maybe' | 'not_going';
  status: 'pending' | 'accepted' | 'declined' | null;
  metadata: Record<string, any>; // JSONB
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

// Legacy interfaces for backward compatibility
export interface UserJamBaseEvent {
  id: string;
  user_id: string;
  jambase_event_id: string; // This maps to related_entity_id in relationships
  created_at: string;
}

export interface Match {
  id: string;
  user1_id: string; // Maps to user_id in relationships
  user2_id: string; // Maps to related_entity_id in relationships
  event_id: string; // Stored in metadata.event_id
  created_at: string;
}

export interface UserSwipe {
  id: string; // Maps to engagements id
  swiper_user_id: string; // Maps to user_id in engagements
  swiped_user_id: string; // Maps to entity_id in engagements
  event_id: string; // Stored in metadata.event_id
  is_interested: boolean; // Maps to engagement_value === 'right'
  created_at: string;
}

// Legacy interface - deprecated
export interface EventInterest {
  id: string;
  user_id: string;
  event_id: string; // This should be jambase_event_id in the new system
  created_at: string;
}

// ============================================
// 6. REVIEWS TABLE (from reviews)
// ============================================
export interface Review {
  id: string; // UUID
  user_id: string; // UUID - references users(user_id)
  event_id: string; // UUID - references events(id)
  artist_id: string | null; // UUID - references artists(id)
  venue_id: string | null; // UUID - references venues(id)
  // Core Rating & Reaction
  rating: number; // 1-5
  artist_rating: number | null; // 1-5
  venue_rating: number | null; // 1-5
  performance_rating: number | null; // 0.5-5.0
  venue_rating_new: number | null; // 0.5-5.0
  overall_experience_rating: number | null; // 0.5-5.0
  reaction_emoji: string | null;
  review_text: string | null;
  performance_review_text: string | null;
  venue_review_text: string | null;
  overall_experience_review_text: string | null;
  // Media
  photos: string[] | null;
  videos: string[] | null;
  // Tags / Context
  mood_tags: string[] | null;
  genre_tags: string[] | null;
  context_tags: string[] | null;
  venue_tags: string[] | null;
  artist_tags: string[] | null;
  review_type: string | null;
  // Social / Engagement
  likes_count: number;
  comments_count: number;
  shares_count: number;
  // Privacy & Metadata
  is_public: boolean;
  is_draft: boolean;
  attendees: string[] | null;
  rank_order: number | null;
  was_there: boolean;
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

// Legacy alias for backward compatibility
export interface UserReview extends Review {}

// ============================================
// 7. ENTITIES TABLE (unified entities table for polymorphic references)
// ============================================
export interface Entity {
  id: string; // UUID - primary key
  entity_type: 'review' | 'event' | 'artist' | 'venue' | 'comment' | 'user' | 'city' | 'scene';
  entity_uuid: string | null; // UUID - for UUID-based entities
  entity_text_id: string | null; // TEXT - for text-based entities (cities, scenes)
  created_at: string; // TIMESTAMPTZ
}

// ============================================
// 8. COMMENTS TABLE (unified comments table)
// ============================================
export interface Comment {
  id: string; // UUID
  user_id: string; // UUID - references users(user_id)
  entity_id: string; // UUID - FK to entities.id (replaces entity_type + entity_id)
  // Note: To get entity_type, join with entities table: JOIN entities ON entities.id = comments.entity_id
  parent_comment_id: string | null; // UUID - references comments(id)
  comment_text: string;
  likes_count: number;
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

// ============================================
// 9. ENGAGEMENTS TABLE (unified engagements table)
// ============================================
export interface Engagement {
  id: string; // UUID
  user_id: string; // UUID - references users(user_id)
  entity_id: string; // UUID - FK to entities.id (replaces entity_type + entity_id)
  // Note: To get entity_type, join with entities table: JOIN entities ON entities.id = engagements.entity_id
  engagement_type: 'like' | 'share' | 'swipe';
  engagement_value: string | null; // 'left', 'right' for swipes; platform for shares
  metadata: Record<string, any>; // JSONB
  created_at: string; // TIMESTAMPTZ
}

// ============================================
// 10. INTERACTIONS TABLE (from user_interactions)
// ============================================
export interface Interaction {
  id: string; // UUID
  user_id: string; // UUID - references users(user_id)
  identity_issuer: string | null;
  identity_sub: string | null;
  global_user_id: string | null;
  session_id: string | null; // UUID
  event_type: string;
  entity_type: string; // Kept for analytics purposes
  entity_id: string | null; // Legacy external ID (kept as metadata)
  entity_uuid: string | null; // UUID foreign key (primary identity for UUID-based entities)
  entity_id_fk: string | null; // UUID - FK to entities.id (optional, for referential integrity)
  occurred_at: string; // TIMESTAMPTZ
  metadata: Record<string, any>; // JSONB
  created_at: string; // TIMESTAMPTZ
}

// ============================================
// 10. ANALYTICS_DAILY (materialized view - derived from interactions)
// ============================================
// Note: This is a materialized view (analytics_daily_mv) that aggregates data
// from the interactions table. interactions is the source of truth.
// The view is read-only - refresh it with: REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_daily_mv;
export interface AnalyticsDaily {
  id: string; // UUID
  entity_type: 'user' | 'event' | 'artist' | 'venue' | 'campaign';
  entity_id: string | null; // Text identifier (used for entities without UUIDs, e.g., campaigns)
  entity_uuid: string | null; // UUID foreign key (NULL for entities that only have entity_id, such as campaigns)
  date: string; // DATE
  metrics: Record<string, any>; // JSONB
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

// ============================================
// 11. USER_PREFERENCES TABLE (unified preferences table)
// ============================================
export interface UserPreferences {
  id: string; // UUID
  user_id: string; // UUID - references users(user_id)
  preferred_genres: string[] | null;
  preferred_artists: string[] | null; // UUID[] - references artists(id)
  preferred_venues: string[] | null;
  notification_preferences: Record<string, any>; // JSONB
  email_preferences: Record<string, any>; // JSONB
  privacy_settings: Record<string, any>; // JSONB
  streaming_stats: Record<string, any>; // JSONB
  achievements: Record<string, any>; // JSONB
  music_preference_signals: Record<string, any>; // JSONB
  recommendation_cache: Record<string, any>; // JSONB
  created_at: string; // TIMESTAMPTZ
  updated_at: string; // TIMESTAMPTZ
}

// ============================================
// 12. EXISTING TABLES (unchanged)
// ============================================

export interface Chat {
  id: string;
  chat_name: string; // NOT NULL, default 'Chat'
  is_group_chat: boolean; // NOT NULL, default false
  // Note: users array and member_count removed - use chat_participants table as source of truth
  // Query chat_participants table directly or use get_user_chats() RPC function which computes member_count
  latest_message_id?: string | null; // UUID - references messages(id)
  group_admin_id?: string | null; // UUID - references users(user_id)
  created_at?: string | null; // TIMESTAMPTZ, default now()
  updated_at?: string | null; // TIMESTAMPTZ, default now()
  // Verified chat fields
  entity_type?: 'event' | 'artist' | 'venue' | null;
  entity_id?: string | null; // TEXT - can be UUID or text ID (jambase_artist_id, venue_name)
  entity_uuid?: string | null; // UUID - references actual entity table (events.id, artists.id, venues.id)
  is_verified?: boolean | null; // default false
  last_activity_at?: string | null; // TIMESTAMPTZ
}

export interface ChatParticipant {
  id: string; // UUID - primary key
  chat_id: string; // UUID - references chats(id)
  user_id: string; // UUID - references users(user_id)
  joined_at: string; // TIMESTAMPTZ - NOT NULL, default now()
  last_read_at?: string | null; // TIMESTAMPTZ
  is_admin?: boolean | null; // default false
  notifications_enabled?: boolean | null; // default true
}

export interface ChatMembersView {
  chat_id: string; // UUID
  user_id: string; // UUID
  joined_at: string; // TIMESTAMPTZ
  is_admin?: boolean | null;
  last_read_at?: string | null;
  notifications_enabled?: boolean | null;
  name: string; // from users table
  avatar_url?: string | null; // from users table
  username?: string | null; // from users table
}

export interface Message {
  id: string;
  chat_id: string; // UUID - references chats(id)
  sender_id: string; // UUID - references users(user_id)
  content: string;
  created_at: string;
}

// Legacy interface - deprecated, use Event from concertSearch.ts instead
export interface DBEvent {
  id: string; // Changed from number to string (UUID)
  event_name: string;
  location: string;
  event_date: string;
  event_time?: string; // Made optional since events uses full timestamp
  url?: string;
  event_price?: string;
  // New fields from events for compatibility
  title?: string;
  artist_name?: string;
  venue_name?: string;
  venue_city?: string;
  venue_state?: string;
  jambase_event_id?: string;
}