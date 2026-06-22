import type { SynthSupabaseClient } from './supabaseClientType';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Creates or returns existing genre community group chat via Supabase RPC. */
export async function getOrCreateGenreChat(
  supabase: SynthSupabaseClient,
  genreId: string,
  chatName: string
): Promise<{ chatId: string | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_or_create_genre_chat', {
      p_genre_id: genreId,
      p_chat_name: chatName,
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
