import { supabase } from '../integrations/supabase/client';

export interface PublicUserRecoveryResult {
  success: boolean;
  inserted: boolean;
  userId: string | null;
  error: string | null;
}

const RPC_NAME = 'ensure_public_user';
const SIGNUP_ALERT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SIGNUP_WEBHOOK_URL = 'https://join.getsynth.app/api/slack-signup-webhook';

async function notifySlackSignupIfRecent(): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session?.access_token || !session.user?.created_at) return;
    const ageMs = Date.now() - new Date(session.user.created_at).getTime();
    if (ageMs > SIGNUP_ALERT_MAX_AGE_MS) return;

    await fetch(SIGNUP_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ source: 'client' }),
    });
  } catch (err) {
    console.warn('[publicUserRecovery.mobile] Slack signup notify failed', err);
  }
}

export async function ensurePublicUserProfile(): Promise<PublicUserRecoveryResult> {
  try {
    const { data, error } = await supabase.rpc(RPC_NAME);

    if (error) {
      console.error('[publicUserRecovery.mobile] RPC failed:', error);
      return {
        success: false,
        inserted: false,
        userId: null,
        error: error.message ?? 'RPC execution failed',
      };
    }

    const row = Array.isArray(data) ? data[0] : data;
    const reportedError = (row as any)?.error ?? null;

    if (reportedError) {
      console.warn('[publicUserRecovery.mobile] Server reported an error while ensuring profile:', reportedError);
    }

    const userId = (row as any)?.user_id ?? null;
    const inserted = Boolean((row as any)?.inserted);

    console.log(
      `[publicUserRecovery.mobile] ensured public.users row for ${userId ?? 'unknown'} (inserted=${inserted}, rpcError=${reportedError ?? 'none'})`
    );

    if (!reportedError) {
      void notifySlackSignupIfRecent();
    }

    return {
      success: !reportedError,
      inserted,
      userId,
      error: reportedError,
    };
  } catch (err: any) {
    console.error('[publicUserRecovery.mobile] Unexpected error:', err);
    return {
      success: false,
      inserted: false,
      userId: null,
      error: err?.message ?? 'Unexpected error ensuring public user row',
    };
  }
}
