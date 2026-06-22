import { supabase } from '../integrations/supabase/client';

export interface ProfileFriend {
  id: string;
  user_id: string;
  name: string;
  username?: string;
  avatar_url: string | null;
  bio: string | null;
}

/**
 * Same semantics as web `FriendsService.getFriends` (accepted friendships on either side of the row).
 */
export async function getFriendsForProfile(userId: string): Promise<ProfileFriend[]> {
  try {
    const { data: friendships, error: friendsError } = await supabase
      .from('user_relationships')
      .select('id, user_id, related_user_id, created_at')
      .eq('relationship_type', 'friend')
      .eq('status', 'accepted')
      .or(`user_id.eq.${userId},related_user_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (friendsError || !friendships?.length) {
      if (friendsError) console.warn('[friendsService]', friendsError.message);
      return [];
    }

    const userIdsSet = new Set<string>();
    friendships.forEach((f) => {
      const other = f.user_id === userId ? f.related_user_id : f.user_id;
      if (other && String(other) !== userId) userIdsSet.add(String(other));
    });
    const userIds = Array.from(userIdsSet);
    if (userIds.length === 0) return [];

    const { data: profiles, error: profilesError } = await supabase
      .from('users')
      .select('id, name, username, avatar_url, bio, user_id')
      .in('user_id', userIds);

    if (profilesError) {
      console.warn('[friendsService] profiles', profilesError.message);
      return [];
    }

    const friendsMap = new Map<string, ProfileFriend>();

    friendships.forEach((friendship) => {
      const otherUserId =
        friendship.user_id === userId
          ? String(friendship.related_user_id)
          : String(friendship.user_id);
      if (friendsMap.has(otherUserId) || otherUserId === userId) return;

      const profile = profiles?.find((p) => String(p.user_id) === otherUserId);
      friendsMap.set(otherUserId, {
        id: profile?.id || otherUserId,
        user_id: otherUserId,
        name: profile?.name || 'Unknown User',
        username: profile?.username ?? undefined,
        avatar_url: profile?.avatar_url ?? null,
        bio: profile?.bio ?? null,
      });
    });

    return Array.from(friendsMap.values());
  } catch (e) {
    console.warn('[friendsService] getFriendsForProfile', e);
    return [];
  }
}
