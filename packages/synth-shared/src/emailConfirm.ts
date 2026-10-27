/**
 * Email confirmation is on (since 2026-10-23). After sign-up, web and iOS show a
 * "check your email" screen and quietly retry sign-in until the link is clicked.
 */

/** Supabase's 60s per-email limit on resending the confirmation. */
export const EMAIL_CONFIRM_RESEND_COOLDOWN_SEC = 60;
/** Retry interval while waiting; 20/5min stays under Supabase's ~30 sign-ins/5min per IP. */
export const EMAIL_CONFIRM_POLL_MS = 15_000;
/** Stop retrying after this; returning to the app/tab still re-checks. */
export const EMAIL_CONFIRM_POLL_MAX_MS = 15 * 60_000;

export function isEmailNotConfirmedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === 'email_not_confirmed') return true;
  return typeof e.message === 'string' && e.message.toLowerCase().includes('email not confirmed');
}
