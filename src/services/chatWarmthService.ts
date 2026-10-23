/**
 * Chat warmth snapshot consumer (Home hide/show).
 *
 * Contract: LOI-561 warmth-evaluation-contract v1.
 * Chat owns gate math + `homeEligible`. This client only filters and caches.
 * Do not branch on message counts, member counts, or `demoSeedLive` here.
 */
import { supabase } from '@/integrations/supabase/client';

export type ChatWarmthKind = 'scene_persistent' | 'featured_show';

export type ChatWarmthFailReason =
  | 'members_below_8'
  | 'activity_below_3'
  | 'not_demo_seed_live'
  | 'show_not_featured';

/** Contract v1 evaluation snapshot (camelCase). */
export type ChatWarmthSnapshot = {
  chatId: string;
  chatKind: ChatWarmthKind;
  showId: string | null;
  homeEligible: boolean;
  gate: {
    dcIcpMemberCount: number;
    humanMessageCount24h: number;
    demoSeedLive: boolean;
    featuredParentInSet: boolean;
    failReasons: ChatWarmthFailReason[];
  };
  evaluatedAt: string;
  /** Optional display enrichment from Chat / chats join (not part of gate). */
  displayName?: string | null;
  chatKey?: string | null;
};

export type HomeWarmChat = {
  chatId: string;
  chatKind: ChatWarmthKind;
  showId: string | null;
  displayName: string;
  evaluatedAt: string;
};

export const HOME_WARM_STRIP_MIN = 3;
export const HOME_WARM_STRIP_MAX = 5;
/** Soft cache TTL per contract: ≤5 min. */
export const WARMTH_CACHE_TTL_MS = 5 * 60 * 1000;

const SCENE_DISPLAY_NAMES: Record<string, string> = {
  'scene.this_week_dc': 'This week in DC',
  'scene.going_out': 'Going out tonight / this weekend',
};

type CacheEntry = {
  fetchedAt: number;
  snapshots: ChatWarmthSnapshot[];
};

let memoryCache: CacheEntry | null = null;

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

function asFailReasons(value: unknown): ChatWarmthFailReason[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>([
    'members_below_8',
    'activity_below_3',
    'not_demo_seed_live',
    'show_not_featured',
  ]);
  return value.filter((r): r is ChatWarmthFailReason => typeof r === 'string' && allowed.has(r));
}

/** Normalize snake_case or camelCase rows from Chat into contract v1. */
export function normalizeWarmthSnapshot(raw: Record<string, unknown>): ChatWarmthSnapshot | null {
  const chatId = String(raw.chatId ?? raw.chat_id ?? '').trim();
  if (!chatId) return null;

  const kindRaw = String(raw.chatKind ?? raw.chat_kind ?? '').trim();
  const chatKind: ChatWarmthKind =
    kindRaw === 'featured_show' ? 'featured_show' : 'scene_persistent';

  const gateRaw =
    (raw.gate as Record<string, unknown> | undefined) ??
    ({} as Record<string, unknown>);

  const showIdVal = raw.showId ?? raw.show_id;
  const showId =
    showIdVal == null || showIdVal === '' ? null : String(showIdVal);

  return {
    chatId,
    chatKind,
    showId,
    homeEligible: asBool(raw.homeEligible ?? raw.home_eligible),
    gate: {
      dcIcpMemberCount: asNumber(
        gateRaw.dcIcpMemberCount ?? gateRaw.dc_icp_member_count ?? raw.dc_icp_member_count
      ),
      humanMessageCount24h: asNumber(
        gateRaw.humanMessageCount24h ??
          gateRaw.human_message_count_24h ??
          raw.human_message_count_24h
      ),
      demoSeedLive: asBool(
        gateRaw.demoSeedLive ?? gateRaw.demo_seed_live ?? raw.demo_seed_live
      ),
      featuredParentInSet: asBool(
        gateRaw.featuredParentInSet ??
          gateRaw.featured_parent_in_set ??
          raw.featured_parent_in_set ??
          true
      ),
      failReasons: asFailReasons(
        gateRaw.failReasons ?? gateRaw.fail_reasons ?? raw.fail_reasons
      ),
    },
    evaluatedAt: String(
      raw.evaluatedAt ?? raw.evaluated_at ?? new Date(0).toISOString()
    ),
    displayName:
      (raw.displayName as string | null | undefined) ??
      (raw.display_name as string | null | undefined) ??
      (raw.chat_name as string | null | undefined) ??
      null,
    chatKey:
      (raw.chatKey as string | null | undefined) ??
      (raw.chat_key as string | null | undefined) ??
      (raw.entity_id as string | null | undefined) ??
      null,
  };
}

/**
 * Home warm strip selection: `homeEligible === true` only, max 5, never pad.
 * Under-gate chats are omitted (still joinable from show detail elsewhere).
 */
export function selectHomeWarmStripChats(
  snapshots: ChatWarmthSnapshot[],
  opts?: { max?: number }
): ChatWarmthSnapshot[] {
  const max = opts?.max ?? HOME_WARM_STRIP_MAX;
  return snapshots.filter((s) => s.homeEligible === true).slice(0, max);
}

function resolveDisplayName(snapshot: ChatWarmthSnapshot, chatName?: string | null): string {
  if (snapshot.displayName && snapshot.displayName.trim()) return snapshot.displayName.trim();
  if (chatName && chatName.trim()) return chatName.trim();
  if (snapshot.chatKey && SCENE_DISPLAY_NAMES[snapshot.chatKey]) {
    return SCENE_DISPLAY_NAMES[snapshot.chatKey];
  }
  if (snapshot.chatKind === 'scene_persistent') return 'Scene room';
  return 'Show chat';
}

async function enrichDisplayNames(
  eligible: ChatWarmthSnapshot[]
): Promise<HomeWarmChat[]> {
  if (eligible.length === 0) return [];

  const ids = eligible.map((s) => s.chatId);
  const nameById = new Map<string, string | null>();

  try {
    const { data, error } = await supabase
      .from('chats')
      .select('id, chat_name, entity_id')
      .in('id', ids);
    if (!error && data) {
      for (const row of data as Array<{
        id: string;
        chat_name: string | null;
        entity_id: string | null;
      }>) {
        nameById.set(row.id, row.chat_name);
        const snap = eligible.find((s) => s.chatId === row.id);
        if (snap && !snap.chatKey && row.entity_id) {
          snap.chatKey = row.entity_id;
        }
      }
    }
  } catch {
    // Display enrichment is best-effort; strip still works on chatId alone.
  }

  return eligible.map((s) => ({
    chatId: s.chatId,
    chatKind: s.chatKind,
    showId: s.showId,
    displayName: resolveDisplayName(s, nameById.get(s.chatId)),
    evaluatedAt: s.evaluatedAt,
  }));
}

/**
 * Fetch raw warmth snapshots from Chat (LOI-577 / contract v1).
 * Primary: RPC `get_home_warm_chats` → `{ items, fetchedAt }`.
 * Fallback: cached columns on `chats` (`warmth_home_eligible`, …).
 * Never invent eligibility — empty on missing surface.
 */
async function fetchWarmthSnapshotsFromChat(): Promise<ChatWarmthSnapshot[]> {
  // Preferred: Chat Home RPC (already filters homeEligible server-side; we still re-filter).
  try {
    const { data, error } = await supabase.rpc('get_home_warm_chats', {
      p_limit: HOME_WARM_STRIP_MAX,
    });
    if (!error && data) {
      const payload = data as { items?: unknown } | unknown[];
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { items?: unknown }).items)
          ? ((payload as { items: unknown[] }).items)
          : [];
      return items
        .map((row) => normalizeWarmthSnapshot((row || {}) as Record<string, unknown>))
        .filter((s): s is ChatWarmthSnapshot => s != null);
    }
  } catch {
    // RPC may not be deployed yet.
  }

  // Fallback: denormalized warmth columns on chats (same evaluator cache).
  try {
    const { data, error } = await supabase
      .from('chats')
      .select(
        'id, chat_name, chat_key, chat_kind, entity_id, warmth_home_eligible, warmth_gate, warmth_evaluated_at'
      )
      .eq('warmth_home_eligible', true)
      .limit(HOME_WARM_STRIP_MAX);
    if (!error && Array.isArray(data)) {
      return data
        .map((row) => {
          const r = row as Record<string, unknown>;
          return normalizeWarmthSnapshot({
            chatId: r.id,
            chat_id: r.id,
            chatKind: r.chat_kind,
            chat_kind: r.chat_kind,
            showId: r.entity_id,
            show_id: r.entity_id,
            homeEligible: r.warmth_home_eligible,
            home_eligible: r.warmth_home_eligible,
            gate: r.warmth_gate,
            evaluatedAt: r.warmth_evaluated_at,
            evaluated_at: r.warmth_evaluated_at,
            displayName: r.chat_name,
            chat_name: r.chat_name,
            chatKey: r.chat_key,
            chat_key: r.chat_key,
          });
        })
        .filter((s): s is ChatWarmthSnapshot => s != null);
    }
  } catch {
    // Columns may not exist until LOI-577 migration is applied.
  }

  return [];
}

export function clearWarmthCache(): void {
  memoryCache = null;
}

export function isWarmthCacheFresh(now = Date.now()): boolean {
  if (!memoryCache) return false;
  return now - memoryCache.fetchedAt < WARMTH_CACHE_TTL_MS;
}

/**
 * Home warm chats: eligible only, capped at 5, ≤5 min cache.
 * Pass `force: true` on focus soft-refresh.
 */
export async function getHomeWarmChats(opts?: {
  force?: boolean;
}): Promise<HomeWarmChat[]> {
  const force = opts?.force === true;
  const now = Date.now();

  if (!force && memoryCache && isWarmthCacheFresh(now)) {
    return enrichDisplayNames(selectHomeWarmStripChats(memoryCache.snapshots));
  }

  const snapshots = await fetchWarmthSnapshotsFromChat();
  memoryCache = { fetchedAt: now, snapshots };
  return enrichDisplayNames(selectHomeWarmStripChats(snapshots));
}
