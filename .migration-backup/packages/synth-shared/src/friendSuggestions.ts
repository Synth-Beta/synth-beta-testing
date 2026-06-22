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

function mapSimilarRpcRow(r: Record<string, unknown>): SharedFriendSuggestion {
  return {
    user_id: String(r.recommended_user_id ?? ''),
    name: (r.name as string) || 'Unknown User',
    avatar_url: (r.avatar_url as string | null) ?? null,
    verified: true,
    connection_depth: (r.connection_degree as number) ?? 3,
    mutual_friends_count: (r.mutual_friends_count as number) ?? 0,
    shared_genres_count: (r.shared_genres_count as number) ?? 0,
  };
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
  const { data: existingRelationships } = await client
    .from('user_relationships')
    .select('user_id, related_user_id, status')
    .eq('relationship_type', 'friend')
    .in('status', ['pending', 'accepted'])
    .or(`user_id.eq.${userId},related_user_id.eq.${userId}`);

  const excludedUserIds = new Set<string>();
  existingRelationships?.forEach((rel: { user_id: string; related_user_id: string }) => {
    const other = rel.user_id === userId ? rel.related_user_id : rel.user_id;
    excludedUserIds.add(other);
  });

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

/** Primary pool: RPC, then {@link getRecommendedFriendsFallback}. */
export async function getSimilarUsersToFriend(
  client: SynthSupabaseClient,
  userId: string,
  limit: number
): Promise<SharedFriendSuggestion[]> {
  try {
    const { data, error } = await client.rpc('get_similar_users_to_friend', {
      p_user_id: userId,
      p_limit: limit,
    });
    if (!error && data?.length) {
      return (data as Record<string, unknown>[]).map(mapSimilarRpcRow).filter(s => s.user_id);
    }
  } catch {
    // fall through
  }
  return getRecommendedFriendsFallback(client, userId, limit);
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
