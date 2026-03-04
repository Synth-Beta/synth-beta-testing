/**
 * shareDeepLinkService.ts
 *
 * Handles the full lifecycle of a share deep link:
 *
 *  1. CAPTURE  — extract ?event/review/artist/venue + ?ref (sharer's userId) from the URL
 *  2. PERSIST  — store in sessionStorage so it survives the auth redirect
 *  3. PROCESS  — after the user is authenticated:
 *       a. Auto-send a friend request to the sharer (if ?ref= is present)
 *       b. Navigate to the shared content
 *       c. Show a welcome toast ("Shared by @username")
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShareContentType = 'event' | 'review' | 'artist' | 'venue';

export interface PendingShareLink {
  type:      ShareContentType;
  id:        string;   // eventId / reviewId / artistId / venueId
  referrerId: string | null; // userId of the person who shared
}

// ─── Storage key ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'synth_pending_share_link';

// ─── Parse helpers ────────────────────────────────────────────────────────────

/**
 * Parses a share URL (or URL search string) into a PendingShareLink.
 * Returns null if the URL has no recognised share params.
 *
 * Supports:
 *   ?event=UUID&ref=USERID
 *   ?review=UUID&ref=USERID
 *   ?artist=UUID&ref=USERID
 *   ?venue=UUID&ref=USERID
 */
export function parseShareUrl(urlOrSearch: string): PendingShareLink | null {
  try {
    const params = urlOrSearch.startsWith('http')
      ? new URL(urlOrSearch).searchParams
      : new URLSearchParams(urlOrSearch);

    const ref = params.get('ref');

    if (params.get('event'))  return { type: 'event',  id: params.get('event')!,  referrerId: ref };
    if (params.get('review')) return { type: 'review', id: params.get('review')!, referrerId: ref };
    if (params.get('artist')) return { type: 'artist', id: params.get('artist')!, referrerId: ref };
    if (params.get('venue'))  return { type: 'venue',  id: params.get('venue')!,  referrerId: ref };
  } catch {
    // malformed URL — ignore
  }
  return null;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export function storePendingLink(link: PendingShareLink): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(link));
}

export function loadPendingLink(): PendingShareLink | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingShareLink;
  } catch {
    return null;
  }
}

export function clearPendingLink(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

// ─── Friend request ───────────────────────────────────────────────────────────

/**
 * Silently sends a friend request from currentUserId → referrerId.
 * No-ops if:
 *  - same user
 *  - friendship / request already exists
 *  - any DB error (we don't want to block navigation)
 *
 * Returns the referrer's profile { display_name, username } for the welcome toast,
 * or null if not found.
 */
export async function autoFriendReferrer(
  currentUserId: string,
  referrerId:    string
): Promise<{ display_name: string | null; username: string | null } | null> {
  if (currentUserId === referrerId) return null;

  try {
    // 1. Get referrer profile for the welcome toast
    const { data: profile } = await supabase
      .from('users')
      .select('display_name, username')
      .eq('user_id', referrerId)
      .maybeSingle();

    // 2. Check if any relationship already exists in either direction
    const { data: existing } = await supabase
      .from('user_relationships')
      .select('id, status')
      .eq('relationship_type', 'friend')
      .or(
        `and(user_id.eq.${currentUserId},related_user_id.eq.${referrerId}),` +
        `and(user_id.eq.${referrerId},related_user_id.eq.${currentUserId})`
      )
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Already friends or pending — no need to insert, just return profile for toast
      return profile ?? null;
    }

    // 3. Insert friend request (pending)
    await supabase.from('user_relationships').insert({
      user_id:          currentUserId,
      related_user_id:  referrerId,
      relationship_type: 'friend',
      status:           'pending',
      metadata:         { source: 'share_link' }
    });

    // 4. Insert a notification for the referrer
    await supabase.from('notifications').insert({
      user_id: referrerId,
      type:    'friend_request',
      title:   'New friend request',
      message: 'Someone joined Synth from your share link and sent you a friend request!',
      metadata: { source: 'share_link', from_user_id: currentUserId }
    });

    return profile ?? null;
  } catch (err) {
    console.error('[shareDeepLink] autoFriendReferrer error:', err);
    return null;
  }
}

// ─── Resolve event ID from review ─────────────────────────────────────────────

export async function resolveEventIdFromReview(reviewId: string): Promise<string | null> {
  const { data } = await supabase
    .from('reviews')
    .select('event_id')
    .eq('id', reviewId)
    .maybeSingle();
  return data?.event_id ?? null;
}

// ─── Full process-after-auth flow ─────────────────────────────────────────────

/**
 * Call this once the user is authenticated.
 * Returns a NavigationInstruction telling the caller what to open.
 */
export interface NavigationInstruction {
  type:        ShareContentType;
  id:          string;            // eventId for events/reviews; artistId; venueId
  reviewId?:   string;            // present when type === 'review', for review-specific UI
  referrer?:   { display_name: string | null; username: string | null };
}

export async function processPendingShareLink(
  currentUserId: string
): Promise<NavigationInstruction | null> {
  const link = loadPendingLink();
  if (!link) return null;
  clearPendingLink();

  // Auto-friend referrer (fire-and-forget style; toast info returned)
  const referrer = link.referrerId
    ? await autoFriendReferrer(currentUserId, link.referrerId)
    : null;

  // For reviews: resolve the underlying eventId so we can open the event detail
  if (link.type === 'review') {
    const eventId = await resolveEventIdFromReview(link.id);
    if (!eventId) return null;
    return {
      type:     'review',
      id:       eventId,
      reviewId: link.id,
      referrer: referrer ?? undefined,
    };
  }

  return {
    type:    link.type,
    id:      link.id,
    referrer: referrer ?? undefined,
  };
}
