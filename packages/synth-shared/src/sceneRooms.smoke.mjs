/**
 * Pure-logic smoke checks for LOI-562 onboarding join plans.
 * Duplicates core rules so we can run without a TS loader.
 * Run: node packages/synth-shared/src/sceneRooms.smoke.mjs
 */

const SCENE_ROOM_IDS = {
  THIS_WEEK_IN_DC: 'dc-this-week',
  GOING_OUT: 'dc-going-out',
};

const ONBOARDING_MAX_ROOM_JOINS = 2;

function isDcCity(city) {
  if (!city) return false;
  const c = city.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!c) return false;
  const exact = new Set([
    'dc',
    'd.c',
    'd.c.',
    'washington',
    'washington, dc',
    'washington dc',
    'washington d.c',
    'washington d.c.',
    'district of columbia',
    'arlington',
    'arlington, va',
    'alexandria',
    'alexandria, va',
    'silver spring',
    'silver spring, md',
    'bethesda',
    'bethesda, md',
    'georgetown',
    'capitol hill',
  ]);
  if (exact.has(c)) return true;
  if (/\bwashington\b/.test(c) && (/\bdc\b/.test(c) || /\bd\.c\.?\b/.test(c) || c.includes('district'))) {
    return true;
  }
  return false;
}

function buildOnboardingJoinPlan({
  locationCity,
  preference,
  joinOptionalRoom2,
  optionalRoom2Enabled = true,
}) {
  const isDc = isDcCity(locationCity);
  if (!isDc) {
    return {
      isDc: false,
      requiredRoomId: null,
      optionalRoomId: null,
      roomJoinCount: 0,
      suggestFeaturedShow: false,
      offerOptionalRoom2: false,
    };
  }
  const offerOptionalRoom2 =
    optionalRoom2Enabled &&
    (preference === 'free_this_weekend' ||
      preference === 'campus_org_night' ||
      preference === 'venue_cluster');
  const takeOptional = offerOptionalRoom2 && joinOptionalRoom2 === true;
  const requiredRoomId = SCENE_ROOM_IDS.THIS_WEEK_IN_DC;
  const optionalRoomId = takeOptional ? SCENE_ROOM_IDS.GOING_OUT : null;
  const roomJoinCount = Math.min(1 + (optionalRoomId ? 1 : 0), ONBOARDING_MAX_ROOM_JOINS);
  return {
    isDc: true,
    requiredRoomId,
    optionalRoomId,
    roomJoinCount,
    suggestFeaturedShow: !!preference,
    offerOptionalRoom2,
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(isDcCity('Washington, DC'), 'dc city');
assert(isDcCity('Arlington'), 'arlington');
assert(isDcCity('DC'), 'exact dc');
assert(!isDcCity('Chicago'), 'non-dc');
assert(!isDcCity('Washington State'), 'washington state false positive');
assert(!isDcCity('medicine'), 'dc substring false positive');
assert(!isDcCity('Georgetown, KY'), 'georgetown ky false positive');
const required = buildOnboardingJoinPlan({
  locationCity: 'Washington, DC',
  preference: 'free_this_weekend',
  joinOptionalRoom2: false,
});
assert(required.requiredRoomId === 'dc-this-week', 'room1 required');
assert(required.optionalRoomId === null, 'room2 not forced');
assert(required.roomJoinCount === 1, 'one join');

const withOptional = buildOnboardingJoinPlan({
  locationCity: 'Washington DC',
  preference: 'venue_cluster',
  joinOptionalRoom2: true,
});
assert(withOptional.optionalRoomId === 'dc-going-out', 'room2 opt-in');
assert(withOptional.roomJoinCount <= ONBOARDING_MAX_ROOM_JOINS, 'cap');

const killed = buildOnboardingJoinPlan({
  locationCity: 'DC',
  preference: 'free_this_weekend',
  joinOptionalRoom2: true,
  optionalRoom2Enabled: false,
});
assert(killed.optionalRoomId === null, 't2 kill switch');
assert(killed.offerOptionalRoom2 === false, 't2 offer off');

const soft = buildOnboardingJoinPlan({
  locationCity: 'Austin',
  preference: 'campus_org_night',
  joinOptionalRoom2: true,
});
assert(soft.roomJoinCount === 0, 'soft gate non-dc');

console.log('sceneRooms smoke OK');
