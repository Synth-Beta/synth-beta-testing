import { supabase } from '@/integrations/supabase/client';

const TABLE = 'user_artist_exclusions';

export const ArtistExclusionService = {
  async list(userId: string): Promise<Set<string>> {
    const { data, error } = await (supabase as any).from(TABLE).select('artist_id').eq('user_id', userId);
    if (error) {
      // Table ships in 20261019120000_feed_v5_exclusions_reviews.sql; until it is applied
      // the feed simply has no exclusions.
      console.warn('[ArtistExclusionService] list failed:', error.message);
      return new Set();
    }
    return new Set((data ?? []).map((r: { artist_id: string }) => r.artist_id));
  },

  async exclude(userId: string, artistId: string): Promise<void> {
    const { error } = await (supabase as any)
      .from(TABLE)
      .upsert({ user_id: userId, artist_id: artistId, source: 'home_feed' }, { onConflict: 'user_id,artist_id' });
    if (error) throw error;
  },

  async restore(userId: string, artistId: string): Promise<void> {
    const { error } = await (supabase as any).from(TABLE).delete().eq('user_id', userId).eq('artist_id', artistId);
    if (error) throw error;
  },
};
