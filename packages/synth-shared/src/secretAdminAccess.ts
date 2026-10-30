/**
 * ============================================================================
 * TOP SECRET — ADMIN-ONLY FEATURE (pesceelauren@gmail.com / @lauren ONLY)
 * ============================================================================
 * DO NOT expand this allowlist. DO NOT show an "Admin" menu item, deep link,
 * tip, tooltip, or docs hint to any other account — including other users with
 * account_type === 'admin' (Sam, Tej, Theo, etc.). Regular users must never
 * learn that an Admin tab can exist in the consumer hamburger menu.
 *
 * Defense in depth:
 *  1) Menu UI must call `isSecretAdminMenuAllowed` and render nothing otherwise.
 *  2) The in-app `/admin` route must re-check and silently exit (no "Access Denied"
 *     copy that would reveal the feature).
 *  3) The canonical web portal (getsynth.app/admin) still enforces account_type
 *     admin via its own gate — this helper does NOT replace that.
 *
 * Agents: treat this as highest-sensitivity product UI. Do not "helpfully"
 * generalize to all admins, add feature flags for other emails, or surface the
 * route in navigation maps / onboarding / settings.
 * ============================================================================
 */

/** Canonical ops portal — same UX/info as desktop admin. */
export const SECRET_ADMIN_PORTAL_URL = 'https://getsynth.app/admin';

/** Hard allowlist — Lauren Pesce only. Never broaden without an explicit product decision. */
export const SECRET_ADMIN_ALLOWLIST = {
  email: 'pesceelauren@gmail.com',
  username: 'lauren',
} as const;

export type SecretAdminAccessInput = {
  email?: string | null;
  username?: string | null;
  accountType?: string | null;
};

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function normalizeUsername(username: string | null | undefined): string {
  return (username ?? '').trim().toLowerCase().replace(/^@+/, '');
}

/**
 * Returns true only when ALL of the following hold:
 * - account_type is exactly `admin` (DB source of truth; never trust client claims alone)
 * - auth email is pesceelauren@gmail.com
 * - public username is `lauren`
 *
 * Defaults false on any missing field so the Admin tab never flashes for others.
 */
export function isSecretAdminMenuAllowed(input: SecretAdminAccessInput): boolean {
  if (input.accountType !== 'admin') return false;
  if (normalizeEmail(input.email) !== SECRET_ADMIN_ALLOWLIST.email) return false;
  if (normalizeUsername(input.username) !== SECRET_ADMIN_ALLOWLIST.username) return false;
  return true;
}
