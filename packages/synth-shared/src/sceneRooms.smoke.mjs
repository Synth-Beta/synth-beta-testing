/**
 * Pure-logic smoke checks for LOI-562 onboarding join plans.
 * Duplicates core rules so we can run without a TS loader.
 * Run: node packages/synth-shared/src/sceneRooms.smoke.mjs
 */

const SCENE_ROOM_IDS = {
  THIS_WEEK_IN_DC: 'scene.dc.this_week',
  GOING_OUT: 'scene.dc.going_out',
};

const ONBOARDING_MAX_ROOM_JOINS = 2;

function isDcCity(city) {
  if (!city) return false;
  const c = city.trim().toLowerCase();
  if (!c) return false;
  if (c === 'dc' || c === 'd.c.' || c === 'd.c') return true;
  const needles = [
    'washington',
    'arlington',
    'alexandria',
    'silver spring',
    'bethesda',
    'georgetown',
    'capitol hill',
    'district of columbia',
  ];
  return needles.some((n) => c === n || c.includes(n));
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
assert(!isDcCity('Chicago'), 'non-dc');

const required = buildOnboardingJoinPlan({
  locationCity: 'Washington, DC',
  preference: 'free_this_weekend',
  joinOptionalRoom2: false,
});
assert(required.requiredRoomId === 'scene.dc.this_week', 'room1 required');
assert(required.optionalRoomId === null, 'room2 not forced');
assert(required.roomJoinCount === 1, 'one join');

const withOptional = buildOnboardingJoinPlan({
  locationCity: 'Washington DC',
  preference: 'venue_cluster',
  joinOptionalRoom2: true,
});
assert(withOptional.optionalRoomId === 'scene.dc.going_out', 'room2 opt-in');
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
