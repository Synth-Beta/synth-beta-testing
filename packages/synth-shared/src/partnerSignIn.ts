import type { SynthSupabaseClient } from './supabaseClientType';

/**
 * Standard email + password sign-in that also accepts a Pick Five login (no extra button).
 *
 *   1. Try Synth Auth.
 *   2. Only on "invalid credentials", try Pick Five Auth with the same email and password
 *      (straight from the device to Pick Five; Synth's servers never see the password).
 *   3. Swap the Pick Five token at /api/partner/exchange for a Synth session on the same
 *      UUID (created on first use, so Synth onboarding runs).
 *
 * `partner` is null when Pick Five isn't configured, which makes this plain Synth sign-in.
 */

/** Supabase AuthErrors keep their HTTP status, so callers can map it to a message. */
export type PartnerSignInError = Error & { status?: number; code?: string };
export type PartnerSignInResult = { error: PartnerSignInError | null; via: 'synth' | 'partner' | null };

const isInvalidCredentials = (error: { message?: string; code?: string } | null | undefined) =>
  !!error && (error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message ?? ''));

export const PARTNER_ACCOUNT_EXISTS_MESSAGE =
  'This email already has a Synth account. Sign in with your Synth password.';

export async function signInWithPartnerFallback(opts: {
  synth: SynthSupabaseClient;
  /** A Pick Five Supabase client with persistSession: false. */
  partner: SynthSupabaseClient | null;
  email: string;
  password: string;
  exchangeUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<PartnerSignInResult> {
  const { synth, partner, email, password, exchangeUrl } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const { error: synthError } = await synth.auth.signInWithPassword({ email, password });
  if (!synthError) return { error: null, via: 'synth' };
  if (!partner || !isInvalidCredentials(synthError)) return { error: synthError, via: null };

  const { data: partnerData, error: partnerError } = await partner.auth.signInWithPassword({ email, password });
  const partnerToken: string | undefined = partnerData?.session?.access_token;
  // Not a Pick Five login either: report the original Synth error.
  if (partnerError || !partnerToken) return { error: synthError, via: null };

  try {
    const response = await fetchImpl(exchangeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner_token: partnerToken }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 409) return { error: new Error(PARTNER_ACCOUNT_EXISTS_MESSAGE), via: null };
    if (!response.ok || !body.access_token || !body.refresh_token) {
      return { error: new Error('Could not sign in with your Pick Five account. Please try again.'), via: null };
    }
    const { error: sessionError } = await synth.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    });
    return sessionError ? { error: sessionError, via: null } : { error: null, via: 'partner' };
  } finally {
    // The Pick Five session was only needed to prove identity.
    await partner.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}
