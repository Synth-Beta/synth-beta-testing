/**
 * Cross-platform friend + notification rules (web sidebar + mobile tab bar use different UI,
 * but both must call the same Supabase operations and treat types the same way).
 */
import type { SynthSupabaseClient } from './supabaseClientType';

export const FRIEND_ACCEPTED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Matches web NotificationsPage `friends_only` filter. */
export const FRIENDS_HUB_NOTIFICATION_TYPES = ['friend_request', 'friend_accepted'] as const;
export type FriendsHubNotificationType = (typeof FRIENDS_HUB_NOTIFICATION_TYPES)[number];

export function isFriendsHubNotificationType(type: string): boolean {
  return (FRIENDS_HUB_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

export function requestIdFromFriendRequestData(
  data: Record<string, unknown> | null | undefined
): string | null {
  const rid = data?.request_id;
  if (rid == null || rid === '') return null;
  return String(rid);
}

export function friendIdFromFriendAcceptedData(
  data: Record<string, unknown> | null | undefined
): string | null {
  if (!data) return null;
  const fid = data.friend_id ?? data.sender_id;
  if (fid == null || fid === '') return null;
  return String(fid);
}

export async function deleteExpiredFriendAcceptedNotifications(
  client: SynthSupabaseClient,
  userId: string
): Promise<{ removed: boolean }> {
  const cutoff = new Date(Date.now() - FRIEND_ACCEPTED_RETENTION_MS).toISOString();
  const { data, error } = await client
    .from('notifications')
    .delete()
    .eq('user_id', userId)
    .eq('type', 'friend_accepted')
    .lt('created_at', cutoff)
    .select('id');

  if (error) {
    console.warn('[synth-shared] deleteExpiredFriendAcceptedNotifications:', error.message);
    return { removed: false };
  }
  return { removed: (data?.length ?? 0) > 0 };
}

export async function deleteFriendRequestNotificationsByRequestId(
  client: SynthSupabaseClient,
  userId: string,
  requestId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: rows, error: fetchError } = await client
    .from('notifications')
    .select('id, data')
    .eq('type', 'friend_request')
    .eq('user_id', userId);

  if (fetchError) {
    return { ok: false, error: fetchError.message };
  }

  const matching =
    rows?.filter((n: { data?: { request_id?: string } }) => {
      const rid = n.data?.request_id;
      if (rid == null || requestId == null) return rid === requestId;
      return String(rid) === String(requestId);
    }) ?? [];

  if (matching.length === 0) {
    return { ok: true };
  }

  const { error } = await client
    .from('notifications')
    .delete()
    .in(
      'id',
      matching.map((n: { id: string }) => n.id)
    )
    .eq('user_id', userId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type MinimalFriendRequestNotification = {
  id: string;
  type: string;
  data?: { request_id?: unknown } | null;
};

export async function pruneStaleFriendRequestNotifications<T extends MinimalFriendRequestNotification>(
  client: SynthSupabaseClient,
  userId: string,
  notifications: T[]
): Promise<T[]> {
  const fr = notifications.filter(n => n.type === 'friend_request');
  if (fr.length === 0) return notifications;

  const requestIds = fr.map(n => n.data?.request_id).filter(Boolean) as string[];
  if (requestIds.length === 0) return notifications;

  try {
    // Friend requests live in user_relationships (relationship_type 'friend'), not in a
    // `friend_requests` table - that name 404s, and the `if (error) return notifications`
    // below turned the 404 into a silent no-op, so this never pruned anything on mobile.
    const { data: existing, error } = await client
      .from('user_relationships')
      .select('id, status')
      .in('id', requestIds);

    if (error || !existing) return notifications;

    const pending = new Set(
      existing
        .filter((r: { status?: string; id: string }) => r.status === 'pending')
        .map((r: { id: string }) => String(r.id))
    );
    const staleIds = fr
      .filter(n => {
        const rid = n.data?.request_id;
        const rs = rid == null ? '' : String(rid);
        return !rs || !pending.has(rs);
      })
      .map(n => n.id);

    if (staleIds.length > 0) {
      await client.from('notifications').delete().in('id', staleIds).eq('user_id', userId);
      const stale = new Set(staleIds);
      return notifications.filter(n => !stale.has(n.id));
    }
  } catch (e) {
    console.warn('[synth-shared] pruneStaleFriendRequestNotifications:', e);
  }
  return notifications;
}

/** Same semantics as mobile + web: treat duplicate / already processed as success. */
export async function acceptFriendRequest(
  client: SynthSupabaseClient,
  requestId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!requestId) return { ok: false, error: 'Missing request' };
  const { error } = await client.rpc('accept_friend_request', {
    request_id: requestId,
  });
  if (error) {
    if (
      error.code === '23505' ||
      error.message?.includes('duplicate') ||
      error.message?.includes('unique constraint') ||
      error.message?.includes('not found') ||
      error.message?.includes('already processed')
    ) {
      return { ok: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function declineFriendRequest(
  client: SynthSupabaseClient,
  requestId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!requestId) return { ok: false, error: 'Missing request' };
  const { error } = await client.rpc('decline_friend_request', {
    request_id: requestId,
  });
  if (error) {
    if (error.message?.includes('not found') || error.message?.includes('already processed')) {
      return { ok: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
