import { createClient } from '@supabase/supabase-js';

/**
 * Pick Five's Supabase Auth, used only to check a Pick Five login during Synth sign-in
 * (see signInWithPartnerFallback in @synth/shared). Nothing is persisted: the Pick Five
 * session is exchanged for a Synth session and dropped. Null until both env vars are set,
 * which keeps sign-in Synth-only.
 */
const url = process.env.EXPO_PUBLIC_PICKFIVE_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_PICKFIVE_SUPABASE_KEY?.trim();

export const pickFiveAuthClient =
  url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    : null;
