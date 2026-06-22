import { supabase } from '../integrations/supabase/client';

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
