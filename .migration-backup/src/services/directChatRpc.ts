import { getOrCreateDirectChat } from '@synth/shared';
import { supabase } from '@/integrations/supabase/client';

/** Web + mobile: same Supabase `create_direct_chat` RPC. */
export async function createOrGetDirectChat(user1Id: string, user2Id: string) {
  return getOrCreateDirectChat(supabase, user1Id, user2Id);
}
