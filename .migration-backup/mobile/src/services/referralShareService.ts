/**
 * Records referral share events: inserts into referral_shares table.
 * Mobile parity for web `src/services/referralShareService.ts`.
 */

import { supabase } from '../integrations/supabase/client';

export async function recordReferralShare(source: string): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const sourceNorm = (source || 'unknown').trim() || 'unknown';
    await supabase.from('referral_shares').insert({
      user_id: user.id,
      source: sourceNorm,
    });
  } catch (e) {
    console.warn('recordReferralShare error:', e);
  }
}

