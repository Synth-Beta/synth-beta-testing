// Types for venue following system

export interface VenueFollow {
  id: string;
  user_id: string;
  venue_name: string;
  venue_city?: string;
  venue_state?: string;
  created_at: string;
  updated_at: string;
}

export interface VenueFollowWithDetails {
  id: string;
  user_id: string;
  venue_name: string;
  venue_city?: string;
  venue_state?: string;
  venue_address?: string;
  venue_image_url?: string;
  num_upcoming_events?: number;
  created_at: string;
  user_name?: string;
  user_avatar_url?: string;
}

export interface VenueFollowStats {
  follower_count: number;
  is_following: boolean;
}

