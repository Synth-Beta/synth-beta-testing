import type { User } from '@supabase/supabase-js';

const RELAY_EMAIL_SUFFIX = '@privaterelay.appleid.com';

type MinimalAuthUser = Pick<User, 'email' | 'app_metadata'>;

/**
 * True when a user signed up via Apple or Google, has no real contact email on
 * file yet, and their auth-provider email is either missing or an undeliverable
 * Apple private-relay address.
 */
export function needsContactEmail(
  user: MinimalAuthUser | null | undefined,
  contactEmail: string | null | undefined
): boolean {
  if (!user) return false;
  const provider = user.app_metadata?.provider;
  // Apple Guideline 4: Sign in with Apple users must never be asked for an email (the
  // relay address Apple provides is valid), so only Google is gated.
  if (provider !== 'google') return false;
  if (contactEmail && contactEmail.trim().length > 0) return false;
  const email = user.email;
  if (!email) return true;
  return email.toLowerCase().endsWith(RELAY_EMAIL_SUFFIX);
}
