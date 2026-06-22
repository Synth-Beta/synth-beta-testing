import type { SynthSupabaseClient } from './supabaseClientType';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Creates or returns existing 1:1 chat via Supabase RPC (same as web UnifiedChatView).
 */
export async function getOrCreateDirectChat(
  supabase: SynthSupabaseClient,
  user1Id: string,
  user2Id: string
): Promise<{ chatId: string | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('create_direct_chat', {
      user1_id: user1Id,
      user2_id: user2Id,
    });
    if (error) {
      return { chatId: null, error: error.message || 'rpc_failed' };
    }
    if (data == null) {
      return { chatId: null, error: null };
    }
    const chatId = typeof data === 'string' ? data : String(data);
    return { chatId: UUID_RE.test(chatId) ? chatId : null, error: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown_error';
    return { chatId: null, error: msg };
  }
}
