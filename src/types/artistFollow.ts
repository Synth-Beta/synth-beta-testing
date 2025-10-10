// Types for artist following system

export interface ArtistFollow {
  id: string;
  user_id: string;
  artist_id: string;
  created_at: string;
  updated_at: string;
}

export interface ArtistFollowWithDetails {
  id: string;
  user_id: string;
  artist_id: string;
  created_at: string;
  artist_name: string;
  artist_image_url?: string;
  jambase_artist_id?: string;
  num_upcoming_events?: number;
  genres?: string[];
  user_name?: string;
  user_avatar_url?: string;
}

export interface ArtistFollowStats {
  follower_count: number;
  is_following: boolean;
}

