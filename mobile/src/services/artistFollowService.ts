import { supabase } from '../integrations/supabase/client';

export class ArtistFollowService {
  static async isFollowingArtist(userId: string, artistId: string): Promise<boolean> {
    const { data } = await supabase
      .from('artist_follows')
      .select('artist_id')
      .eq('user_id', userId)
      .eq('artist_id', artistId)
      .maybeSingle();
    return data != null;
  }

  static async getFollowerCount(artistId: string): Promise<number> {
    const { count } = await supabase
      .from('artist_follows')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artistId);
    return count ?? 0;
  }

  static async setArtistFollow(userId: string, artistId: string, following: boolean): Promise<boolean> {
    if (following) {
      const { error } = await supabase
        .from('artist_follows')
        .upsert({ user_id: userId, artist_id: artistId }, { onConflict: 'user_id,artist_id' });
      return !error;
    } else {
      const { error } = await supabase
        .from('artist_follows')
        .delete()
        .eq('user_id', userId)
        .eq('artist_id', artistId);
      return !error;
    }
  }
}
