import { supabase } from '../integrations/supabase/client';

export interface VenueFollower {
  user_id: string;
  name: string;
  username?: string;
  avatar_url: string | null;
}

export class VenueFollowService {
  static async isFollowingVenue(userId: string, venueId: string): Promise<boolean> {
    const { data } = await supabase
      .from('user_venue_relationships')
      .select('venue_id')
      .eq('user_id', userId)
      .eq('venue_id', venueId)
      .maybeSingle();
    return data != null;
  }

  static async getFollowerCount(venueId: string): Promise<number> {
    const { count } = await supabase
      .from('user_venue_relationships')
      .select('*', { count: 'exact', head: true })
      .eq('venue_id', venueId);
    return count ?? 0;
  }

  static async getVenueFollowers(venueId: string): Promise<VenueFollower[]> {
    try {
      const { data: follows, error } = await supabase
        .from('user_venue_relationships')
        .select('user_id, created_at')
        .eq('venue_id', venueId)
        .order('created_at', { ascending: false });

      if (error || !follows?.length) {
        if (error) console.warn('[VenueFollowService] getVenueFollowers', error.message);
        return [];
      }

      const userIds = [...new Set(follows.map((f) => String(f.user_id)).filter(Boolean))];
      if (userIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from('users')
        .select('user_id, name, username, avatar_url')
        .in('user_id', userIds);

      if (profilesError) {
        console.warn('[VenueFollowService] getVenueFollowers profiles', profilesError.message);
        return [];
      }

      const profileMap = new Map(
        (profiles || []).map((p) => [String(p.user_id), p])
      );

      return userIds.map((uid) => {
        const profile = profileMap.get(uid);
        return {
          user_id: uid,
          name: profile?.name || 'Unknown User',
          username: profile?.username ?? undefined,
          avatar_url: profile?.avatar_url ?? null,
        };
      });
    } catch (e) {
      console.warn('[VenueFollowService] getVenueFollowers', e);
      return [];
    }
  }

  static async setVenueFollow(userId: string, venueId: string, following: boolean): Promise<boolean> {
    if (following) {
      const { error } = await supabase
        .from('user_venue_relationships')
        .upsert({ user_id: userId, venue_id: venueId }, { onConflict: 'user_id,venue_id' });
      return !error;
    } else {
      const { error } = await supabase
        .from('user_venue_relationships')
        .delete()
        .eq('user_id', userId)
        .eq('venue_id', venueId);
      return !error;
    }
  }
}
