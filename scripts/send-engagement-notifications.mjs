/**
 * Engagement Notifications
 *
 * Wires up two notification types that already exist in src/types/notifications.ts
 * but were never triggered anywhere in the codebase:
 *
 *   1. event_attendance_reminder — sent once, the day before an event, to every
 *      user who marked "interested" or "going".
 *   2. friends_event_interest_summary — sent at most once every 6 days to a user
 *      when their friends have marked interest/going on upcoming events they
 *      haven't engaged with themselves yet.
 *
 * Delivery: this script only inserts rows into `notifications`. Actual push
 * delivery is already handled by the existing backend/push-notification-worker.js,
 * which polls unread notifications and sends via Expo push — no changes needed there.
 *
 * Run daily via the same scheduler (launchd/cron) as sync-jambase-incremental-3nf.mjs.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIGEST_MIN_INTERVAL_DAYS = 6;

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL environment variable.');
  }
  if (!serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable. This script needs elevated access to read across all users.');
  }
  if (serviceKey === process.env.SUPABASE_ANON_KEY) {
    throw new Error('SECURITY ERROR: SUPABASE_SERVICE_ROLE_KEY cannot equal SUPABASE_ANON_KEY.');
  }
  return createClient(supabaseUrl, serviceKey);
}

async function sendAttendanceReminders(supabase) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = ymd(tomorrow);
  const dayAfterStr = ymd(new Date(tomorrow.getTime() + 86400000));

  const { data: rows, error } = await supabase
    .from('user_event_relationships')
    .select('user_id, event_id, events:events!user_event_relationships_event_id_fkey!inner(id, title, event_date)')
    .in('relationship_type', ['interested', 'going'])
    .gte('events.event_date', tomorrowStr)
    .lt('events.event_date', dayAfterStr);

  if (error) {
    console.error('❌ Error fetching tomorrow\'s interested/going relationships:', error.message);
    return { sent: 0 };
  }
  const candidates = (rows || []).filter((r) => r.events && r.events.id);
  if (candidates.length === 0) {
    console.log('✅ No events happening tomorrow with interested/going users.');
    return { sent: 0 };
  }

  const userIds = [...new Set(candidates.map((r) => r.user_id))];

  // Dedupe: don't re-remind someone who already got a reminder for this event.
  const { data: existing, error: existingError } = await supabase
    .from('notifications')
    .select('user_id, data')
    .eq('type', 'event_attendance_reminder')
    .in('user_id', userIds)
    .gte('created_at', new Date(Date.now() - 3 * 86400000).toISOString());

  if (existingError) {
    console.error('⚠️  Error checking existing reminders (continuing without dedupe):', existingError.message);
  }
  const alreadyReminded = new Set(
    (existing || []).map((n) => `${n.user_id}:${n.data?.event_id ?? ''}`)
  );

  const toInsert = candidates
    .filter((r) => !alreadyReminded.has(`${r.user_id}:${r.events.id}`))
    .map((r) => ({
      user_id: r.user_id,
      type: 'event_attendance_reminder',
      title: 'Tomorrow!',
      message: `${r.events.title || 'Your event'} is happening tomorrow — don't forget!`,
      data: { event_id: r.events.id, event_title: r.events.title },
    }));

  if (toInsert.length === 0) {
    console.log('✅ All eligible reminders already sent.');
    return { sent: 0 };
  }

  const { error: insertError } = await supabase.from('notifications').insert(toInsert);
  if (insertError) {
    console.error('❌ Error inserting attendance reminders:', insertError.message);
    return { sent: 0 };
  }
  console.log(`✅ Sent ${toInsert.length} event_attendance_reminder notification(s).`);
  return { sent: toInsert.length };
}

async function sendFriendInterestDigest(supabase) {
  const now = new Date();
  const weekOut = ymd(new Date(now.getTime() + 7 * 86400000));
  const todayStr = ymd(now);

  const { data: friendships, error: friendshipError } = await supabase
    .from('user_relationships')
    .select('user_id, related_user_id')
    .eq('relationship_type', 'friend')
    .eq('status', 'accepted');

  if (friendshipError) {
    console.error('❌ Error fetching friendships:', friendshipError.message);
    return { sent: 0 };
  }
  if (!friendships || friendships.length === 0) {
    console.log('✅ No accepted friendships — nothing to digest.');
    return { sent: 0 };
  }

  // Build undirected adjacency map: userId -> Set<friendId>
  const friendsOf = new Map();
  for (const f of friendships) {
    if (!friendsOf.has(f.user_id)) friendsOf.set(f.user_id, new Set());
    if (!friendsOf.has(f.related_user_id)) friendsOf.set(f.related_user_id, new Set());
    friendsOf.get(f.user_id).add(f.related_user_id);
    friendsOf.get(f.related_user_id).add(f.user_id);
  }

  // All interested/going relationships for events in the next 7 days.
  const { data: rows, error } = await supabase
    .from('user_event_relationships')
    .select('user_id, event_id, events:events!user_event_relationships_event_id_fkey!inner(id, title, event_date)')
    .in('relationship_type', ['interested', 'going'])
    .gte('events.event_date', todayStr)
    .lt('events.event_date', weekOut);

  if (error) {
    console.error('❌ Error fetching upcoming-week interested/going relationships:', error.message);
    return { sent: 0 };
  }
  const upcoming = (rows || []).filter((r) => r.events && r.events.id);
  if (upcoming.length === 0) {
    console.log('✅ No upcoming-week event interest to digest.');
    return { sent: 0 };
  }

  // eventId -> Set<userId who is interested/going>
  const interestedByEvent = new Map();
  for (const r of upcoming) {
    if (!interestedByEvent.has(r.events.id)) interestedByEvent.set(r.events.id, new Set());
    interestedByEvent.get(r.events.id).add(r.user_id);
  }
  const myOwnEvents = new Map(); // userId -> Set<eventId> they've already engaged with
  for (const r of upcoming) {
    if (!myOwnEvents.has(r.user_id)) myOwnEvents.set(r.user_id, new Set());
    myOwnEvents.get(r.user_id).add(r.events.id);
  }

  // For each user with friends, find events where a friend (not them) is interested/going,
  // excluding events they're already engaged with.
  const digestByUser = new Map(); // userId -> { eventCount, friendIds: Set }
  for (const [userId, friendIds] of friendsOf.entries()) {
    const ownEvents = myOwnEvents.get(userId) || new Set();
    const relevantFriends = new Set();
    const relevantEvents = new Set();
    for (const [eventId, interestedUsers] of interestedByEvent.entries()) {
      if (ownEvents.has(eventId)) continue;
      for (const friendId of friendIds) {
        if (interestedUsers.has(friendId)) {
          relevantFriends.add(friendId);
          relevantEvents.add(eventId);
        }
      }
    }
    if (relevantEvents.size > 0) {
      digestByUser.set(userId, { eventCount: relevantEvents.size, friendCount: relevantFriends.size });
    }
  }

  if (digestByUser.size === 0) {
    console.log('✅ No users have qualifying friend activity this week.');
    return { sent: 0 };
  }

  const candidateUserIds = [...digestByUser.keys()];
  const { data: recentDigests, error: recentError } = await supabase
    .from('notifications')
    .select('user_id')
    .eq('type', 'friends_event_interest_summary')
    .in('user_id', candidateUserIds)
    .gte('created_at', new Date(Date.now() - DIGEST_MIN_INTERVAL_DAYS * 86400000).toISOString());

  if (recentError) {
    console.error('⚠️  Error checking recent digests (continuing without dedupe):', recentError.message);
  }
  const recentlyDigested = new Set((recentDigests || []).map((n) => n.user_id));

  const toInsert = [];
  for (const [userId, { eventCount, friendCount }] of digestByUser.entries()) {
    if (recentlyDigested.has(userId)) continue;
    toInsert.push({
      user_id: userId,
      type: 'friends_event_interest_summary',
      title: 'Your friends are going out',
      message: `${friendCount} of your friends ${friendCount === 1 ? 'is' : 'are'} interested in ${eventCount} show${eventCount === 1 ? '' : 's'} this week.`,
      data: { event_count: eventCount, friend_count: friendCount },
    });
  }

  if (toInsert.length === 0) {
    console.log('✅ All eligible users already got a digest recently.');
    return { sent: 0 };
  }

  const { error: insertError } = await supabase.from('notifications').insert(toInsert);
  if (insertError) {
    console.error('❌ Error inserting friend interest digests:', insertError.message);
    return { sent: 0 };
  }
  console.log(`✅ Sent ${toInsert.length} friends_event_interest_summary notification(s).`);
  return { sent: toInsert.length };
}

async function main() {
  try {
    const dotenv = await import('dotenv');
    dotenv.default.config({ path: path.join(__dirname, '..', '.env.local') });
  } catch {
    // dotenv not installed, assume env vars are already set
  }

  console.log(`🔔 Engagement notifications run started: ${new Date().toISOString()}`);
  const supabase = getSupabaseClient();

  const reminderResult = await sendAttendanceReminders(supabase);
  const digestResult = await sendFriendInterestDigest(supabase);

  console.log(
    `✨ Done. Reminders sent: ${reminderResult.sent}, digests sent: ${digestResult.sent}`
  );
}

main().catch((error) => {
  console.error(`❌ Fatal error: ${error.message}\n${error.stack}`);
  process.exit(1);
});
