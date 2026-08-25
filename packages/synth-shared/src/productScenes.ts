/**
 * Persistent product scenes SoT (LOI-589).
 * Exactly 2 DC rooms at launch; third gated until Room 1 warmth holds 2 weeks.
 */

import type { SynthSupabaseClient } from './supabaseClientType';

export const PRODUCT_SCENE_METRO_DC = 'dc' as const;

export const SCENE_DC_THIS_WEEK = 'scene.dc.this_week' as const;
export const SCENE_DC_GOING_OUT = 'scene.dc.going_out' as const;

export type PersistentProductSceneId =
  | typeof SCENE_DC_THIS_WEEK
  | typeof SCENE_DC_GOING_OUT;

export type ProductSceneJoinMode = 'required' | 'optional';

export type ProductSceneConfig = {
  id: PersistentProductSceneId;
  displayName: string;
  joinMode: ProductSceneJoinMode;
  sortOrder: number;
  metro: typeof PRODUCT_SCENE_METRO_DC;
};

/** Locked launch set — do not add a third entry until gate unlocks. */
export const PERSISTENT_PRODUCT_SCENES: readonly ProductSceneConfig[] = [
  {
    id: SCENE_DC_THIS_WEEK,
    displayName: 'This week in DC',
    joinMode: 'required',
    sortOrder: 1,
    metro: PRODUCT_SCENE_METRO_DC,
  },
  {
    id: SCENE_DC_GOING_OUT,
    displayName: 'Going out tonight / this weekend',
    joinMode: 'optional',
    sortOrder: 2,
    metro: PRODUCT_SCENE_METRO_DC,
  },
] as const;

export const MAX_LAUNCH_PERSISTENT_SCENES = 2;
export const ROOM1_ACTIVE_MEMBER_TARGET = 40;
export const ROOM2_ACTIVE_MEMBER_TARGET = 25;
export const WARMTH_MIN_DC_ICP_MEMBERS = 8;
export const WARMTH_MIN_HUMAN_MSGS_24H = 3;
export const CO_PRESENCE_SESSION_ONE_THRESHOLD = 20;
export const ROOM1_WARMTH_WEEKS_TO_UNLOCK_THIRD = 2;

/** Legacy aliases remapped by migration / ensure_product_scene_chats. */
export const LEGACY_PRODUCT_SCENE_ALIASES: Record<string, PersistentProductSceneId> = {
  'dc-this-week': SCENE_DC_THIS_WEEK,
  'scene.this_week_dc': SCENE_DC_THIS_WEEK,
  'dc-going-out': SCENE_DC_GOING_OUT,
  'scene.going_out': SCENE_DC_GOING_OUT,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeProductSceneId(
  value: string | null | undefined
): PersistentProductSceneId | null {
  if (!value) return null;
  if (value === SCENE_DC_THIS_WEEK || value === SCENE_DC_GOING_OUT) return value;
  return LEGACY_PRODUCT_SCENE_ALIASES[value] ?? null;
}

export function isPersistentProductSceneId(
  value: string | null | undefined
): value is PersistentProductSceneId {
  return normalizeProductSceneId(value) != null;
}

export function canAddPersistentProductScene(opts: {
  activeCount: number;
  thirdSceneUnlocked: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (opts.thirdSceneUnlocked) return { ok: true };
  if (opts.activeCount >= MAX_LAUNCH_PERSISTENT_SCENES) {
    return {
      ok: false,
      error:
        'Third persistent product scene blocked until Room 1 warmth holds 2 consecutive weeks',
    };
  }
  return { ok: true };
}

export function passesWarmthGate(input: {
  dcIcpMemberCount: number;
  humanMsgs24h: number;
  seedLive: boolean;
}): boolean {
  return (
    input.dcIcpMemberCount >= WARMTH_MIN_DC_ICP_MEMBERS &&
    (input.humanMsgs24h >= WARMTH_MIN_HUMAN_MSGS_24H || input.seedLive)
  );
}

export function meetsCoPresenceThreshold(coPresenceCount: number): boolean {
  return coPresenceCount >= CO_PRESENCE_SESSION_ONE_THRESHOLD;
}

export type PersistentProductSceneRow = {
  sceneId: string;
  displayName: string;
  joinMode: string;
  sortOrder: number;
  metro: string;
  chatId: string | null;
  memberCount: number;
  activeMemberCount: number;
  dcIcpMemberCount: number;
  humanMsgs24h: number;
  seedLive: boolean;
  passesWarmthGate: boolean;
  isUserMember: boolean;
  coPresenceCount: number;
  thirdSceneUnlocked: boolean;
  consecutiveWarmWeeks: number;
};

type RpcRow = {
  scene_id: string;
  display_name: string;
  join_mode: string;
  sort_order: number;
  metro: string;
  chat_id: string | null;
  member_count: number;
  active_member_count: number;
  dc_icp_member_count: number;
  human_msgs_24h: number;
  seed_live: boolean;
  passes_warmth_gate: boolean;
  is_user_member: boolean;
  co_presence_count: number;
  third_scene_unlocked: boolean;
  consecutive_warm_weeks: number;
};

function mapRow(r: RpcRow): PersistentProductSceneRow {
  return {
    sceneId: r.scene_id,
    displayName: r.display_name,
    joinMode: r.join_mode,
    sortOrder: r.sort_order,
    metro: r.metro,
    chatId: r.chat_id,
    memberCount: Number(r.member_count ?? 0),
    activeMemberCount: Number(r.active_member_count ?? 0),
    dcIcpMemberCount: Number(r.dc_icp_member_count ?? 0),
    humanMsgs24h: Number(r.human_msgs_24h ?? 0),
    seedLive: Boolean(r.seed_live),
    passesWarmthGate: Boolean(r.passes_warmth_gate),
    isUserMember: Boolean(r.is_user_member),
    coPresenceCount: Number(r.co_presence_count ?? 0),
    thirdSceneUnlocked: Boolean(r.third_scene_unlocked),
    consecutiveWarmWeeks: Number(r.consecutive_warm_weeks ?? 0),
  };
}

export async function fetchPersistentProductScenes(
  supabase: SynthSupabaseClient,
  opts?: { metro?: string; userId?: string | null }
): Promise<PersistentProductSceneRow[]> {
  const { data, error } = await supabase.rpc('get_persistent_product_scenes', {
    p_metro: opts?.metro ?? PRODUCT_SCENE_METRO_DC,
    p_user_id: opts?.userId ?? null,
  });
  if (error) throw error;
  return ((data || []) as RpcRow[]).map(mapRow);
}

export async function fetchProductSceneMemberCounts(
  supabase: SynthSupabaseClient,
  opts?: { metro?: string }
): Promise<
  Array<{
    sceneId: string;
    chatId: string | null;
    memberCount: number;
    activeMemberCount: number;
    dcIcpMemberCount: number;
  }>
> {
  const { data, error } = await supabase.rpc('get_product_scene_member_counts', {
    p_metro: opts?.metro ?? PRODUCT_SCENE_METRO_DC,
  });
  if (error) throw error;
  return ((data || []) as Array<{
    scene_id: string;
    chat_id: string | null;
    member_count: number;
    active_member_count: number;
    dc_icp_member_count: number;
  }>).map((r) => ({
    sceneId: r.scene_id,
    chatId: r.chat_id,
    memberCount: Number(r.member_count ?? 0),
    activeMemberCount: Number(r.active_member_count ?? 0),
    dcIcpMemberCount: Number(r.dc_icp_member_count ?? 0),
  }));
}

export async function joinProductScene(
  supabase: SynthSupabaseClient,
  sceneId: string,
  userId?: string | null
): Promise<{ chatId: string | null; error: string | null }> {
  try {
    const normalized = normalizeProductSceneId(sceneId) ?? sceneId;
    const { data, error } = await supabase.rpc('join_product_scene', {
      p_scene_id: normalized,
      p_user_id: userId ?? null,
    });
    if (error) return { chatId: null, error: error.message || 'rpc_failed' };
    if (data == null) return { chatId: null, error: null };
    const chatId = typeof data === 'string' ? data : String(data);
    return { chatId: UUID_RE.test(chatId) ? chatId : null, error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown_error';
    return { chatId: null, error: msg };
  }
}

export async function fetchProductSceneCoPresence(
  supabase: SynthSupabaseClient,
  opts?: { sceneId?: string; userId?: string | null }
): Promise<{
  sceneId: string;
  chatId: string | null;
  coPresenceCount: number;
  meetsSessionOneThreshold: boolean;
} | null> {
  const { data, error } = await supabase.rpc('get_product_scene_co_presence', {
    p_scene_id: opts?.sceneId ?? SCENE_DC_THIS_WEEK,
    p_user_id: opts?.userId ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    sceneId: row.scene_id,
    chatId: row.chat_id,
    coPresenceCount: Number(row.co_presence_count ?? 0),
    meetsSessionOneThreshold: Boolean(row.meets_session_one_threshold),
  };
}
