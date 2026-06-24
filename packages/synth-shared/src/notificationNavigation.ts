/**
 * Maps notification rows (type + JSON data) to Expo paths — same intent as web NotificationsPage handlers.
 */

export type NotificationNavResult = { path: string } | null;

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v);
  return s.length ? s : undefined;
}

export type NotificationNavContext = {
  /** Row-level actor (notifications.actor_user_id), merged with data.actor_user_id */
  actorUserId?: string | null;
};

const EVENT_SUMMARY_TYPES = new Set([
  'event_interest',
  'event_attendance_reminder',
  'event_reminder',
  'friend_rsvp_going',
  'friend_rsvp_changed',
  'friend_review_posted',
  'friend_attended_same_event',
  'follows_new_events_summary',
  'friends_event_interest_summary',
  'bucket_list_new_events_summary',
]);

/**
 * Returns an Expo Router path when the notification should deep-link; otherwise null (stay on list).
 * friend_request: null here — Expo `NotificationsFeed` marks read then navigates to `/user/:id` or `/friend-requests`.
 */
export function resolveNotificationExpoPath(
  type: string,
  data: Record<string, unknown> | null | undefined,
  ctx?: NotificationNavContext
): NotificationNavResult {
  const d = data && typeof data === 'object' ? data : {};
  const actorFromRow = str(ctx?.actorUserId);
  const actorFromData = str(d.actor_user_id);
  const actor = actorFromRow || actorFromData;

  if (type === 'friend_request') {
    return null;
  }

  if (type === 'message' || type === 'chat_message') {
    const chatId = str(d.chat_id);
    if (chatId) return { path: `/chat/${chatId}` };
    return null;
  }

  if (type === 'friend_tagged_in_review') {
    const artist = str(d.artist_id);
    const venue = str(d.venue_id);
    const q: string[] = [];
    if (artist) q.push(`prefillArtistId=${encodeURIComponent(artist)}`);
    if (venue) q.push(`prefillVenueId=${encodeURIComponent(venue)}`);
    const eventDate = str(d.Event_date) || str((d as { event_date?: string }).event_date);
    if (eventDate) q.push(`prefillDate=${encodeURIComponent(eventDate)}`);
    return { path: q.length ? `/review-compose?${q.join('&')}` : '/review-compose' };
  }

  const eventId = str(d.event_id);

  if (type === 'artist_new_event') {
    if (eventId) return { path: `/event/${eventId}` };
    const artistId = str(d.artist_id);
    if (artistId) return { path: `/artist/${artistId}` };
    return null;
  }

  if (type === 'venue_new_event') {
    if (eventId) return { path: `/event/${eventId}` };
    const venueId = str(d.venue_id);
    if (venueId) return { path: `/venue/${venueId}` };
    return null;
  }

  if (EVENT_SUMMARY_TYPES.has(type)) {
    if (eventId) return { path: `/event/${eventId}` };
    return { path: '/(tabs)/discover' };
  }

  if (type === 'friend_accepted') {
    const uid = str(d.sender_id) || str(d.friend_id) || actor;
    if (uid) return { path: `/user/${uid}` };
    return null;
  }

  if (type === 'review_liked' || type === 'review_commented' || type === 'comment_replied') {
    const reviewId = str(d.review_id);
    if (reviewId) return { path: `/review/${reviewId}` };
    if (eventId) return { path: `/event/${eventId}` };
    return null;
  }

  if (eventId) return { path: `/event/${eventId}` };

  if (actor) return { path: `/user/${actor}` };

  return null;
}
