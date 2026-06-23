/**
 * Records referral share events: inserts into referral_shares and interactions tables.
 * Call this when the user clicks Share or Send via text (banner or review flow).
 */

import { supabase } from '@/integrations/supabase/client';
import { trackInteraction } from '@/services/interactionTrackingService';

const REFERRAL_ENTITY_ID_PREFIX = 'referral_';

/**
 * Record a referral share: insert into referral_shares and log a share interaction.
 * Uses current auth user; no-op if not authenticated.
 */
export async function recordReferralShare(source: string): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const sourceNorm = (source || 'unknown').trim() || 'unknown';

    const { error: insertError } = await supabase.from('referral_shares').insert({
      user_id: user.id,
      source: sourceNorm,
    });

    if (insertError) {
      console.warn('Referral share insert failed:', insertError);
    }

    trackInteraction.share(
      'form',
      `${REFERRAL_ENTITY_ID_PREFIX}${sourceNorm}`,
      undefined,
      { source: sourceNorm }
    );
  } catch (e) {
    console.warn('recordReferralShare error:', e);
  }
}
