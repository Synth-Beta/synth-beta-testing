/**
 * Home warmth strip — thin client over server evaluator (LOI-577).
 * Do not re-implement member / message / demoSeedLive thresholds here.
 */

import { supabase } from '@/integrations/supabase/client';
import {
  fetchChatWarmthSnapshot,
  fetchHomeWarmChats,
  type ChatWarmthSnapshot,
  type HomeWarmChatsResponse,
} from '@synth/shared';

const CACHE_TTL_MS = 5 * 60 * 1000;

let homeWarmCache: { at: number; data: HomeWarmChatsResponse } | null = null;

export async function getHomeWarmChats(options?: {
  limit?: number;
  forceRefresh?: boolean;
}): Promise<{ data: HomeWarmChatsResponse | null; error: string | null }> {
  const limit = options?.limit ?? 5;
  if (
    !options?.forceRefresh &&
    homeWarmCache &&
    Date.now() - homeWarmCache.at < CACHE_TTL_MS
  ) {
    return { data: homeWarmCache.data, error: null };
  }

  const result = await fetchHomeWarmChats(supabase as any, limit);
  if (result.data) {
    homeWarmCache = { at: Date.now(), data: result.data };
  }
  return result;
}

export async function getChatWarmthSnapshot(
  chatId: string,
  options?: { refresh?: boolean }
): Promise<{ data: ChatWarmthSnapshot | null; error: string | null }> {
  return fetchChatWarmthSnapshot(supabase as any, chatId, options);
}

export function clearHomeWarmChatsCache(): void {
  homeWarmCache = null;
}
