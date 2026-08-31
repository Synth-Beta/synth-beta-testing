/**
 * Self-check for the friends-digest aggregation in send-engagement-notifications.mjs.
 * Pure logic, no database. Run: node scripts/test-digest-window.mjs
 * Exits non-zero on failure.
 *
 * `aggregate` below must stay identical to the per-user loop in
 * sendFriendInterestDigest(). If you change one, change both.
 */
import assert from 'node:assert/strict';

function aggregate(friendsOf, interestedByEvent, myOwnEvents) {
  const digestByUser = new Map();
  for (const [userId, friendIds] of friendsOf.entries()) {
    const ownEvents = myOwnEvents.get(userId) || new Set();
    const relevantFriends = new Set();
    const relevantEvents = new Set();
    const goingFriends = new Set();
    for (const [eventId, rsvpByUser] of interestedByEvent.entries()) {
      if (ownEvents.has(eventId)) continue;
      for (const friendId of friendIds) {
        const rsvp = rsvpByUser.get(friendId);
        if (!rsvp) continue;
        relevantFriends.add(friendId);
        relevantEvents.add(eventId);
        if (rsvp === 'going') goingFriends.add(friendId);
      }
    }
    if (relevantEvents.size > 0) {
      digestByUser.set(userId, {
        eventCount: relevantEvents.size,
        friendCount: relevantFriends.size,
        goingCount: goingFriends.size,
      });
    }
  }
  return digestByUser;
}

const friendsOf = new Map([['me', new Set(['a', 'b'])]]);
const interestedByEvent = new Map([
  ['e1', new Map([['a', 'going'], ['b', 'interested']])],
  ['e2', new Map([['a', 'interested']])],
  ['e3', new Map([['stranger', 'going']])],
]);

let out = aggregate(friendsOf, interestedByEvent, new Map());
assert.deepEqual(
  out.get('me'),
  { eventCount: 2, friendCount: 2, goingCount: 1 },
  'counts two events and two friends, one of them going; the stranger is ignored'
);

out = aggregate(friendsOf, interestedByEvent, new Map([['me', new Set(['e1'])]]));
assert.deepEqual(
  out.get('me'),
  { eventCount: 1, friendCount: 1, goingCount: 0 },
  'events the user already engaged with are excluded, taking their going friend with them'
);

out = aggregate(new Map([['me', new Set(['nobody'])]]), interestedByEvent, new Map());
assert.equal(out.has('me'), false, 'no qualifying friend activity produces no digest at all');

// A friend counted once even when going to several shows.
out = aggregate(
  new Map([['me', new Set(['a'])]]),
  new Map([
    ['e1', new Map([['a', 'going']])],
    ['e2', new Map([['a', 'going']])],
  ]),
  new Map()
);
assert.deepEqual(
  out.get('me'),
  { eventCount: 2, friendCount: 1, goingCount: 1 },
  'one friend going to two shows is one friend, two events'
);

console.log('digest aggregation: all assertions passed');
