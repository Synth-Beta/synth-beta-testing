// Legacy interface - deprecated, use Event from concertSearch.ts instead
export interface DBEvent {
  id: string; // Changed from number to string (UUID)
  event_name: string;
  location: string;
  event_date: string;
  event_time?: string; // Made optional since jambase_events uses full timestamp
  url?: string;
  event_price?: string;
  // New fields from jambase_events for compatibility
  title?: string;
  artist_name?: string;
  venue_name?: string;
  venue_city?: string;
  venue_state?: string;
  jambase_event_id?: string;
}

export interface Profile {
  id: string;
  user_id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  instagram_handle: string | null;
  music_streaming_profile: string | null;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  is_public_profile: boolean;
}

// Legacy interface - deprecated, use user_jambase_events instead
export interface EventInterest {
  id: string;
  user_id: string;
  event_id: string; // This should be jambase_event_id in the new system
  created_at: string;
}

// New interface matching the actual database schema
export interface UserJamBaseEvent {
  id: string;
  user_id: string;
  jambase_event_id: string;
  created_at: string;
}

export interface UserSwipe {
  id: string;
  swiper_user_id: string;
  swiped_user_id: string;
  event_id: string;
  is_interested: boolean;
  created_at: string;
}

export interface Match {
  id: string;
  user1_id: string;
  user2_id: string;
  event_id: string;
  created_at: string;
}

export interface Chat {
  id: string;
  match_id: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}