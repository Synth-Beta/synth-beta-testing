import type { SynthSupabaseClient } from './supabaseClientType';
import { getOrCreateGenreChat } from './genreChat';
import {
  OPTIONAL_SCENE_ROOM_2_ENABLED,
  SCENE_ROOM_STORAGE_ENTITY_TYPE,
  SCENE_ROOMS,
  type OnboardingPreferenceId,
  type SceneRoomId,
  buildOnboardingJoinPlan,
  pickFeaturedShowForPreference,
  type FeaturedShowCandidate,
} from './sceneRooms';

export type ApplyOnboardingRoomJoinsInput = {
  userId: string;
  locationCity: string | null | undefined;
  preference: OnboardingPreferenceId | null;
  joinOptionalRoom2: boolean;
  /** When true, mark interested on the suggested featured show (opt-in). */
  markFeaturedInterested: boolean;
  optionalRoom2Enabled?: boolean;
};

export type ApplyOnboardingRoomJoinsResult = {
  plan: ReturnType<typeof buildOnboardingJoinPlan>;
  joinedRoomIds: SceneRoomId[];
  suggestedShow: FeaturedShowCandidate | null;
  markedInterestedEventId: string | null;
  errors: string[];
  /** True when DC required room 1 did not land (fail closed before Home). */
  requiredJoinFailed: boolean;
};

async function ensureSceneRoomChatId(
  supabase: SynthSupabaseClient,
  roomId: SceneRoomId
): Promise<{ chatId: string | null; error: string | null }> {
  const room = SCENE_ROOMS.find((r) => r.id === roomId);
  if (!room) return { chatId: null, error: 'unknown_room' };

  // Prefer native scene rows once migration is applied.
  const { data: sceneExisting } = await supabase
    .from('chats')
    .select('id')
    .eq('entity_type', 'scene')
    .eq('entity_id', roomId)
    .eq('is_group_chat', true)
    .maybeSingle();
  if (sceneExisting?.id) {
    return { chatId: sceneExisting.id, error: null };
  }

  const { data: rpcSceneId, error: rpcSceneError } = await supabase.rpc(
    'get_or_create_scene_room',
    {
      p_scene_id: roomId,
      p_chat_name: room.name,
    }
  );
  if (!rpcSceneError && rpcSceneId) {
    const chatId = typeof rpcSceneId === 'string' ? rpcSceneId : String(rpcSceneId);
    return { chatId, error: null };
  }

  const { data: existing, error: lookupError } = await supabase
    .from('chats')
    .select('id')
    .eq('entity_type', SCENE_ROOM_STORAGE_ENTITY_TYPE)
    .eq('entity_id', roomId)
    .eq('is_group_chat', true)
    .maybeSingle();

  if (lookupError) {
    return { chatId: null, error: lookupError.message };
  }
  if (existing?.id) {
    return { chatId: existing.id, error: null };
  }

  // Fallback today: reuse genre chat RPC with reserved scene ids.
  return getOrCreateGenreChat(supabase, roomId, room.name);
}

async function joinChatParticipant(
  supabase: SynthSupabaseClient,
  chatId: string,
  userId: string
): Promise<string | null> {
  const { error } = await supabase.from('chat_participants').insert({
    chat_id: chatId,
    user_id: userId,
  });
  if (error && error.code !== '23505') {
    return error.message;
  }
  return null;
}

async function loadFeaturedCandidates(
  supabase: SynthSupabaseClient
): Promise<FeaturedShowCandidate[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, artist_name, venue_name, venue_city, event_date, is_promoted, promotion_tier'
    )
    .gte('event_date', now)
    .order('event_date', { ascending: true })
    .limit(80);

  if (error || !data) return [];
  return data as FeaturedShowCandidate[];
}

async function markEventInterested(
  supabase: SynthSupabaseClient,
  userId: string,
  eventId: string
): Promise<string | null> {
  const { error } = await supabase.from('user_event_relationships').upsert(
    {
      user_id: userId,
      event_id: eventId,
      relationship_type: 'interested',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,event_id,relationship_type' }
  );
  if (error && error.code !== '23505') {
    return error.message;
  }
  return null;
}

/**
 * Apply density onboarding membership rules.
 * Auto-joins room 1 for DC; optional room 2 only when opted in and T2 switch is on.
 * Never joins 3+ rooms. Featured interest is opt-in only.
 */
export async function applyOnboardingRoomJoins(
  supabase: SynthSupabaseClient,
  input: ApplyOnboardingRoomJoinsInput
): Promise<ApplyOnboardingRoomJoinsResult> {
  const plan = buildOnboardingJoinPlan({
    locationCity: input.locationCity,
    preference: input.preference,
    joinOptionalRoom2: input.joinOptionalRoom2,
    optionalRoom2Enabled: input.optionalRoom2Enabled ?? OPTIONAL_SCENE_ROOM_2_ENABLED,
  });

  const result: ApplyOnboardingRoomJoinsResult = {
    plan,
    joinedRoomIds: [],
    suggestedShow: null,
    markedInterestedEventId: null,
    errors: [],
    requiredJoinFailed: false,
  };

  if (!plan.isDc || !plan.requiredRoomId) {
    return result;
  }

  const roomsToJoin: SceneRoomId[] = [plan.requiredRoomId];
  if (plan.optionalRoomId) {
    roomsToJoin.push(plan.optionalRoomId);
  }

  for (const roomId of roomsToJoin.slice(0, 2)) {
    const isRequired = roomId === plan.requiredRoomId;
    const { chatId, error } = await ensureSceneRoomChatId(supabase, roomId);
    if (!chatId) {
      result.errors.push(error || `missing_chat:${roomId}`);
      if (isRequired) {
        result.requiredJoinFailed = true;
        return result;
      }
      continue;
    }
    const joinError = await joinChatParticipant(supabase, chatId, input.userId);
    if (joinError) {
      result.errors.push(joinError);
      if (isRequired) {
        result.requiredJoinFailed = true;
        return result;
      }
      continue;
    }
    result.joinedRoomIds.push(roomId);
  }

  if (plan.suggestFeaturedShow && input.preference) {
    const candidates = await loadFeaturedCandidates(supabase);
    result.suggestedShow = pickFeaturedShowForPreference(input.preference, candidates);
    if (
      input.markFeaturedInterested &&
      result.suggestedShow?.id
    ) {
      const markError = await markEventInterested(
        supabase,
        input.userId,
        result.suggestedShow.id
      );
      if (markError) {
        result.errors.push(markError);
      } else {
        result.markedInterestedEventId = result.suggestedShow.id;
      }
    }
  }

  if (!result.joinedRoomIds.includes(plan.requiredRoomId)) {
    result.requiredJoinFailed = true;
  }

  return result;
}
