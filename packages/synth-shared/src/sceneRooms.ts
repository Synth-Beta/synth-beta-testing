/**
 * Density scene rooms (LOI-562 / LOI-547 / LOI-597).
 *
 * Product owns two persistent collision rooms for DC ICP onboarding.
 * Canonical chat keys: scene.dc.this_week + scene.dc.going_out.
 * Legacy aliases (dc-this-week, scene.this_week_dc, …) remap in SQL.
 */

export const SCENE_ROOM_STORAGE_ENTITY_TYPE = 'scene' as const;

/** Canonical product chat keys — never add these to GENRE_CONFIGS. */
export const SCENE_ROOM_IDS = {
  THIS_WEEK_IN_DC: 'scene.dc.this_week',
  GOING_OUT: 'scene.dc.going_out',
} as const;

export type SceneRoomId = (typeof SCENE_ROOM_IDS)[keyof typeof SCENE_ROOM_IDS];

/** Legacy ids accepted by join/lookup until all clients migrate. */
export const SCENE_ROOM_LEGACY_ALIASES: Record<string, SceneRoomId> = {
  'dc-this-week': 'scene.dc.this_week',
  'scene.this_week_dc': 'scene.dc.this_week',
  'dc-going-out': 'scene.dc.going_out',
  'scene.going_out': 'scene.dc.going_out',
};

export type SceneRoomDefinition = {
  id: SceneRoomId;
  name: string;
  /** Required = auto-joined for DC users before Home. */
  required: boolean;
};

export const SCENE_ROOMS: readonly SceneRoomDefinition[] = [
  {
    id: SCENE_ROOM_IDS.THIS_WEEK_IN_DC,
    name: 'This week in DC',
    required: true,
  },
  {
    id: SCENE_ROOM_IDS.GOING_OUT,
    name: 'Going out tonight / this weekend',
    required: false,
  },
] as const;

export const REQUIRED_SCENE_ROOM = SCENE_ROOMS.find((r) => r.required)!;
export const OPTIONAL_SCENE_ROOM = SCENE_ROOMS.find((r) => !r.required)!;

/** Hard cap: never join 3+ rooms during density onboarding. */
export const ONBOARDING_MAX_ROOM_JOINS = 2;

/**
 * Chicken-egg T2 kill switch (LOI-547).
 * When false, force room 1 only; optional room 2 stays off until PM reopens.
 * Flip after T2 readout: ≥70% of new DC users land with ≥20 ICP co-members.
 */
export const OPTIONAL_SCENE_ROOM_2_ENABLED = true;

export const ONBOARDING_PREFERENCE_IDS = [
  'campus_org_night',
  'venue_cluster',
  'free_this_weekend',
] as const;

export type OnboardingPreferenceId = (typeof ONBOARDING_PREFERENCE_IDS)[number];

export const ONBOARDING_PREFERENCE_OPTIONS: readonly {
  id: OnboardingPreferenceId;
  label: string;
  description: string;
}[] = [
  {
    id: 'campus_org_night',
    label: 'Campus org night',
    description: 'School-linked shows and friend groups.',
  },
  {
    id: 'venue_cluster',
    label: 'Venue cluster',
    description: 'A favorite DC room or block of venues.',
  },
  {
    id: 'free_this_weekend',
    label: "I'm free this weekend",
    description: 'Open plans. Match me to warm nights out.',
  },
] as const;

const DC_CITY_NEEDLES = [
  'washington',
  'washington, dc',
  'washington dc',
  'dc',
  'district of columbia',
  'arlington',
  'alexandria',
  'silver spring',
  'bethesda',
  'georgetown',
  'capitol hill',
] as const;

/** Soft DC gate for density onboarding (metro-adjacent OK). */
export function isDcCity(city: string | null | undefined): boolean {
  if (!city) return false;
  const c = city.trim().toLowerCase();
  if (!c) return false;
  if (c === 'dc' || c === 'd.c.' || c === 'd.c') return true;
  return DC_CITY_NEEDLES.some((needle) => c === needle || c.includes(needle));
}

export function canonicalizeSceneRoomId(
  entityId: string | null | undefined
): SceneRoomId | null {
  if (!entityId) return null;
  if ((Object.values(SCENE_ROOM_IDS) as string[]).includes(entityId)) {
    return entityId as SceneRoomId;
  }
  return SCENE_ROOM_LEGACY_ALIASES[entityId] ?? null;
}

export function isReservedSceneRoomId(entityId: string | null | undefined): boolean {
  return canonicalizeSceneRoomId(entityId) != null;
}

export type OnboardingJoinPlan = {
  /** Soft-gated: non-DC skips forced collision joins. */
  isDc: boolean;
  /** Always room 1 when DC. */
  requiredRoomId: SceneRoomId | null;
  /** Opt-in room 2 only when enabled + user accepted. */
  optionalRoomId: SceneRoomId | null;
  /** Max rooms this plan will join (≤ ONBOARDING_MAX_ROOM_JOINS). */
  roomJoinCount: number;
  /** Suggest one featured-show interested/RSVP (never forced). */
  suggestFeaturedShow: boolean;
  /** Offer optional room 2 (UI); join only if user opts in. */
  offerOptionalRoom2: boolean;
};

/**
 * Pure membership plan for density onboarding.
 * Preference may suggest a show and/or offer room 2 — never force both joins.
 */
export function buildOnboardingJoinPlan(input: {
  locationCity: string | null | undefined;
  preference: OnboardingPreferenceId | null;
  /** User opted into optional room 2. */
  joinOptionalRoom2: boolean;
  optionalRoom2Enabled?: boolean;
}): OnboardingJoinPlan {
  const optionalEnabled = input.optionalRoom2Enabled ?? OPTIONAL_SCENE_ROOM_2_ENABLED;
  const isDc = isDcCity(input.locationCity);

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

  const preference = input.preference;
  const offerOptionalRoom2 =
    optionalEnabled &&
    (preference === 'free_this_weekend' ||
      preference === 'campus_org_night' ||
      preference === 'venue_cluster');

  const suggestFeaturedShow =
    preference === 'campus_org_night' ||
    preference === 'venue_cluster' ||
    preference === 'free_this_weekend';

  const takeOptional =
    offerOptionalRoom2 && optionalEnabled && input.joinOptionalRoom2 === true;

  const requiredRoomId = REQUIRED_SCENE_ROOM.id;
  const optionalRoomId = takeOptional ? OPTIONAL_SCENE_ROOM.id : null;
  const roomJoinCount = 1 + (optionalRoomId ? 1 : 0);

  return {
    isDc: true,
    requiredRoomId,
    optionalRoomId,
    roomJoinCount: Math.min(roomJoinCount, ONBOARDING_MAX_ROOM_JOINS),
    suggestFeaturedShow,
    offerOptionalRoom2,
  };
}

export type FeaturedShowCandidate = {
  id: string;
  title: string | null;
  artist_name: string | null;
  venue_name: string | null;
  venue_city: string | null;
  event_date: string;
  is_promoted?: boolean | null;
  promotion_tier?: string | null;
};

function promotionRank(tier: string | null | undefined, isPromoted?: boolean | null): number {
  if (tier === 'featured') return 3;
  if (tier === 'premium') return 2;
  if (tier === 'basic' || isPromoted) return 1;
  return 0;
}

/**
 * Pick exactly one featured show for the preference (suggestion only).
 */
export function pickFeaturedShowForPreference(
  preference: OnboardingPreferenceId,
  candidates: FeaturedShowCandidate[]
): FeaturedShowCandidate | null {
  const dc = candidates.filter((e) => isDcCity(e.venue_city));
  if (dc.length === 0) return null;

  const ranked = [...dc].sort((a, b) => {
    const pr =
      promotionRank(b.promotion_tier, b.is_promoted) -
      promotionRank(a.promotion_tier, a.is_promoted);
    if (pr !== 0) return pr;
    return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
  });

  if (preference === 'venue_cluster') {
    const withVenue = ranked.find((e) => (e.venue_name || '').trim().length > 0);
    return withVenue ?? ranked[0] ?? null;
  }

  if (preference === 'campus_org_night') {
    // Prefer earlier doors / weekday-friendly first slot in the featured set.
    return ranked[0] ?? null;
  }

  // free_this_weekend — prefer Fri/Sat doors when present.
  const weekend = ranked.find((e) => {
    const day = new Date(e.event_date).getUTCDay();
    return day === 5 || day === 6;
  });
  return weekend ?? ranked[0] ?? null;
}
