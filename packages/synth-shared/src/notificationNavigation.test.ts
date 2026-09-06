/**
 * The day-after "How was the show?" reminder must open the review composer.
 *
 * It used to fall through to the generic `if (eventId) -> /event/:id` tail, so
 * the one notification whose entire purpose is "write a review" dropped the
 * user on the event page instead. It is also the only reminder type gated on
 * relationship_type='going' (see
 * supabase/day-after-going-only-2026-09-06/01_day_after_going_only.REVIEW.sql),
 * so its siblings must keep routing to the event.
 *
 * Run: npx tsx packages/synth-shared/src/notificationNavigation.test.ts
 */

import assert from 'node:assert/strict';
import { resolveNotificationExpoPath } from './notificationNavigation';

const EVENT_ID = 'aaaaaaaa-1111-4222-8333-444444444444';
const ARTIST_ID = 'bbbbbbbb-1111-4222-8333-444444444444';
const VENUE_ID = 'cccccccc-1111-4222-8333-444444444444';

const dayAfterData = {
  event_id: EVENT_ID,
  event_title: 'Big Thief',
  event_venue: 'Brooklyn Steel',
  event_date: '2026-09-04T23:00:00+00:00',
  artist_id: ARTIST_ID,
  venue_id: VENUE_ID,
  reminder_type: 'event_reminder_day_after',
};

// 1. Day-after goes to the review composer, seeded with the event.
assert.deepEqual(
  resolveNotificationExpoPath('event_reminder_day_after', dayAfterData),
  { path: `/review-compose?eventId=${EVENT_ID}` }
);

// 2. No event_id (shouldn't happen, but the jsonb is untyped): fall back to the
//    artist/venue/date prefill the composer also accepts.
const { event_id: _omit, ...noEvent } = dayAfterData;
assert.deepEqual(resolveNotificationExpoPath('event_reminder_day_after', noEvent), {
  path:
    `/review-compose?prefillArtistId=${ARTIST_ID}` +
    `&prefillVenueId=${VENUE_ID}` +
    `&prefillDate=${encodeURIComponent(dayAfterData.event_date)}`,
});

// 3. Nothing usable at all still lands on the composer, not a dead tap.
assert.deepEqual(resolveNotificationExpoPath('event_reminder_day_after', {}), {
  path: '/review-compose',
});

// 4. The upcoming siblings still go to the event page.
for (const type of ['event_reminder_1_week', 'event_reminder_3_days', 'event_reminder_1_day']) {
  assert.deepEqual(
    resolveNotificationExpoPath(type, { event_id: EVENT_ID }),
    { path: `/event/${EVENT_ID}` },
    `${type} should route to the event`
  );
}

console.log('notificationNavigation: day-after review routing OK');
