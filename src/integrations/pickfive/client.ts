import { createClient } from '@supabase/supabase-js';

/**
 * Pick Five's Supabase Auth, used only to check a Pick Five login during Synth sign-in
 * (see signInWithPartnerFallback in @synth/shared). Nothing is persisted. Null until both
 * env vars are set, which keeps sign-in Synth-only.
 */
const url = import.meta.env.VITE_PICKFIVE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_PICKFIVE_SUPABASE_KEY?.trim();

export const pickFiveAuthClient =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'pickfive-auth' },
      })
    : null;
