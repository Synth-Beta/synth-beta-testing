import { supabase } from '../integrations/supabase/client';

const TABLE = 'user_artist_exclusions';

/** "Don't recommend this artist" (same table as web; get_personalized_feed_v5 reads it). */
export const ArtistExclusionService = {
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
