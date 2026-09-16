import * as Crypto from 'expo-crypto';
import { supabase } from '../integrations/supabase/client';

/**
 * Onboarding telemetry for mobile.
 *
 * Mobile wrote NOTHING to `interactions` before this. When someone stalled in the wizard
 * there was no record anywhere, so the only way to investigate a lost signup was inferring
 * from signup timestamps - and most people who stall are on mobile.
 *
 * Naming mirrors web's `trackBlock` (src/components/onboarding/OnboardingFlow.tsx) exactly,
 * so a single query covers both platforms.
 *
 * Three rules, all deliberate:
 *  1. Every write is fire-and-forget and swallows its own errors. Telemetry must NEVER be
 *     the reason someone cannot finish signing up. That is also why a silent failure is
 *     possible here - query 5 in supabase/onboarding-username-block-2026-09-16/
 *     02_funnel.READONLY.sql exists to confirm rows actually arrive.
 *  2. `interactions` has no metadata column (it is dropped on write), so the reason has to
 *     live inside entity_id itself.
 *  3. session_id is a uuid column - web fills it with crypto.randomUUID(). A made-up
 *     string would be rejected and every row silently lost, and crypto.randomUUID() is not
 *     reliably present in React Native, so this uses expo-crypto (already a dependency).
 */
const SESSION_ID = Crypto.randomUUID();

async function record(eventType: string, entityType: string, entityId: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('interactions').insert([
      {
        user_id: user.id,
        session_id: SESSION_ID,
        event_type: eventType,
        entity_type: entityType,
        entity_id: entityId,
        entity_uuid: null,
      },
    ]);
  } catch {
    // Rule 1: never surface, never rethrow.
  }
}

/**
 * A wizard step was shown. `step` is one of: profile | connect | scene | artists.
 * Web is a single page and reports one view ('onboarding_one_page'); mobile reports one
 * per screen, so mobile drop-off is visible step by step.
 */
export function trackOnboardingStep(step: string): void {
  void record('view', 'view', `onboarding_${step}`);
}

/**
 * Onboarding refused to advance. Keep `reason` values in sync with web's trackBlock so
 * both platforms aggregate in one query.
 */
export function trackOnboardingBlock(reason: string): void {
  void record('form_submit', 'form', `onboarding_blocked_${reason}`);
}
