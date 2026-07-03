/**
 * Friend discovery + outbound requests — one implementation for web and Expo mobile.
 */
import type { SynthSupabaseClient } from './supabaseClientType';

export type SharedFriendSuggestion = {
  user_id: string;
  name: string;
  avatar_url: string | null;
  verified?: boolean;
  connection_depth: number;
  mutual_friends_count: number;
  shared_genres_count?: number;
};

/** Fetch the set of user_ids to exclude (already friends or pending). */
async function getExcludedUserIds(
  client: SynthSupabaseClient,
  userId: string
): Promise<Set<string>> {
  const { data } = await client
    .from('user_relationships')
    .select('user_id, related_user_id')
    .eq('relationship_type', 'friend')
    .in('status', ['pending', 'accepted'])
    .or(`user_id.eq.${userId},related_user_id.eq.${userId}`);

  const excluded = new Set<string>();
  excluded.add(userId);
  data?.forEach((rel: { user_id: string; related_user_id: string }) => {
    excluded.add(rel.user_id === userId ? rel.related_user_id : rel.user_id);
  });
  return excluded;
}

/**
 * 2nd/3rd degree fallback when `get_similar_users_to_friend` is unavailable or empty.
 * Excludes users you already have a pending or accepted friend edge with (same as mobile).
 */
export async function getRecommendedFriendsFallback(
  client: SynthSupabaseClient,
  userId: string,
  limit: number
): Promise<SharedFriendSuggestion[]> {
  const excludedUserIds = await getExcludedUserIds(client, userId);

  const [secondDegreeResult, thirdDegreeResult] = await Promise.all([
    client.rpc('get_second_degree_connections', { target_user_id: userId }),
    client.rpc('get_third_degree_connections', { target_user_id: userId }),
  ]);

  const secondDegree = secondDegreeResult.data || [];
  const thirdDegree = thirdDegreeResult.data || [];
  const recommendations: SharedFriendSuggestion[] = [];

  secondDegree.forEach((conn: Record<string, unknown>) => {
    const id = String(conn.connected_user_id ?? '');
    if (!id || excludedUserIds.has(id)) return;
    recommendations.push({
      user_id: id,
      name: (conn.name as string) || 'Unknown User',
      avatar_url: (conn.avatar_url as string | null) || null,
      verified: conn.is_public_profile !== false,
      connection_depth: 2,
      mutual_friends_count: (conn.mutual_friends_count as number) || 0,
    });
  });

  thirdDegree.forEach((conn: Record<string, unknown>) => {
    const id = String(conn.connected_user_id ?? '');
    if (!id || excludedUserIds.has(id)) return;
    recommendations.push({
      user_id: id,
      name: (conn.name as string) || 'Unknown User',
      avatar_url: (conn.avatar_url as string | null) || null,
      verified: conn.is_public_profile !== false,
      connection_depth: 3,
      mutual_friends_count: (conn.mutual_friends_count as number) || 0,
    });
  });

  recommendations.sort((a, b) => {
    if (a.mutual_friends_count !== b.mutual_friends_count) {
      return b.mutual_friends_count - a.mutual_friends_count;
    }
    return a.connection_depth - b.connection_depth;
  });

  const unique = Array.from(new Map(recommendations.map(rec => [rec.user_id, rec])).values());
  return unique.slice(0, limit);
}

/**
 * Broadest fallback: sample recently-active users who are not yet connected.
 * Used when matching-signal and degree-based queries don't yield enough variety.
 */
async function getDiscoveryUsers(
  client: SynthSupabaseClient,
  userId: string,
  excludedIds: Set<string>,
  needed: number
): Promise<SharedFriendSuggestion[]> {
  const { data, error } = await client
    .from('users')
    .select('user_id, name, avatar_url')
    .neq('user_id', userId)
    .not('user_id', 'in', `(${Array.from(excludedIds).join(',')})`)
    .order('created_at', { ascending: false })
    .limit(needed * 3);

  if (error || !data?.length) return [];

  return data
    .filter((u: { user_id: string; name: string; avatar_url: string | null }) =>
      u.user_id && !excludedIds.has(u.user_id)
    )
    .map((u: { user_id: string; name: string; avatar_url: string | null }) => ({
      user_id: u.user_id,
      name: u.name || 'Unknown User',
      avatar_url: u.avatar_url ?? null,
      verified: false,
      connection_depth: 4,
      mutual_friends_count: 0,
      shared_genres_count: 0,
    }))
    .slice(0, needed);
}

/** Primary pool: 2nd/3rd degree connections → recent-users discovery.
 *  Both are merged and deduplicated so the rail always has variety.
 *
 * Note: this previously tried a `get_similar_users_to_friend` RPC first, but that
 * function was never defined in this project's migrations — every call was a
 * guaranteed round-trip failure before falling through to the layers below. Removed
 * rather than reinstated since nothing here depended on its (never-working) output. */
export async function getSimilarUsersToFriend(
  client: SynthSupabaseClient,
  userId: string,
  limit: number
): Promise<SharedFriendSuggestion[]> {
  const seen = new Set<string>();
  const combined: SharedFriendSuggestion[] = [];

  const addUnique = (suggestions: SharedFriendSuggestion[]) => {
    for (const s of suggestions) {
      if (s.user_id && !seen.has(s.user_id)) {
        seen.add(s.user_id);
        combined.push(s);
      }
    }
  };

  // Layer 1: 2nd/3rd degree connections
  if (combined.length < limit) {
    try {
      const fallback = await getRecommendedFriendsFallback(client, userId, limit * 2);
      addUnique(fallback);
    } catch {
      // fall through
    }
  }

  // Layer 2: broad discovery from recently-active users (fills the rail when signals are sparse)
  if (combined.length < limit) {
    try {
      const excludedIds = await getExcludedUserIds(client, userId);
      // also exclude anything already in the combined pool
      combined.forEach(s => excludedIds.add(s.user_id));
      const discovery = await getDiscoveryUsers(
        client,
        userId,
        excludedIds,
        limit - combined.length
      );
      addUnique(discovery);
    } catch {
      // fall through
    }
  }

  return combined.slice(0, limit);
}

/**
 * Same weighted shuffle as web HomeFeed / mobile HomeFeedService — pool should be larger than maxCards (e.g. 20 → 5).
 */
export function rankFriendSuggestionsForRail(
  pool: SharedFriendSuggestion[],
  maxCards: number
): SharedFriendSuggestion[] {
  const scored = pool.map(u => {
    const quality =
      (u.mutual_friends_count ?? 0) * 0.4 +
      (u.shared_genres_count ?? 0) * 0.3 +
      (u.connection_depth === 2 ? 0.3 : 0);
    return { u, score: Math.random() + quality };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxCards).map(s => s.u);
}

export type CreateFriendRequestOutcome =
  | { ok: true; requestId?: string | null }
  | { ok: false; kind: 'business'; message?: string }
  | { ok: false; kind: 'network'; message?: string };

/**
 * Single `create_friend_request` interpretation for web + mobile (business vs retryable errors).
 * `requestId` is returned when the RPC provides it (profile cancel flow).
 */
export async function createFriendRequest(
  client: SynthSupabaseClient,
  receiverUserId: string
): Promise<CreateFriendRequestOutcome> {
  const { data, error } = await client.rpc('create_friend_request', {
    receiver_user_id: receiverUserId,
  });
  if (!error) {
    return {
      ok: true,
      requestId: data != null && data !== '' ? String(data) : null,
    };
  }

  const msg = (error.message || String(error.code || '')).toLowerCase();
  const code = String(error.code || '');
  const isBusiness =
    msg.includes('already') ||
    msg.includes('duplicate') ||
    msg.includes('invalid') ||
    code === '23505' ||
    code === 'PGRST204';

  if (isBusiness) {
    return { ok: false, kind: 'business', message: error.message };
  }
  return { ok: false, kind: 'network', message: error.message };
}
