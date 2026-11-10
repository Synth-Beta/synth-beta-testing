import { supabase } from '../integrations/supabase/client';

export interface ArtistFollower {
  user_id: string;
  name: string;
  username?: string;
  avatar_url: string | null;
}

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

  static async getArtistFollowers(artistId: string): Promise<ArtistFollower[]> {
    try {
      const { data: follows, error } = await supabase
        .from('artist_follows')
        .select('user_id, created_at')
        .eq('artist_id', artistId)
        .order('created_at', { ascending: false })
        // shortcut: newest 500 followers only; add .range() paging if a list needs more.
        .limit(500);

      if (error || !follows?.length) {
        if (error) console.warn('[ArtistFollowService] getArtistFollowers', error.message);
        return [];
      }

      const userIds = [...new Set(follows.map((f) => String(f.user_id)).filter(Boolean))];
      if (userIds.length === 0) return [];

      // Chunked: one .in() with hundreds of UUIDs overflows the request URL.
      const profiles: Array<{ user_id: string; name: string | null; username: string | null; avatar_url: string | null }> = [];
      for (let i = 0; i < userIds.length; i += 80) {
        const { data: chunk, error: profilesError } = await supabase
          .from('users')
          .select('user_id, name, username, avatar_url')
          .in('user_id', userIds.slice(i, i + 80));
        if (profilesError) {
          console.warn('[ArtistFollowService] follower profiles', profilesError.message);
          return [];
        }
        profiles.push(...(chunk || []));
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
      console.warn('[ArtistFollowService] getArtistFollowers', e);
      return [];
    }
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
