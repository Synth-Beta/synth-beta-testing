import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { supabase } from '../src/integrations/supabase/client';

/**
 * Native Apple Sign-In credential. Exchange `identityToken` with Supabase
 * (`signInWithIdToken` / provider `apple`) — mirror web `Auth.tsx` behavior.
 */
export async function getAppleSignInCredential(): Promise<AppleAuthentication.AppleAuthenticationCredential | null> {
  if (Platform.OS !== 'ios') {
    return null;
  }
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) return null;

  return AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
}

/**
 * Apple returns the user's real name ONLY on the very first sign-in (it's in the
 * credential's `fullName`, never in the identity-token JWT). Call this right after
 * a successful `signInWithIdToken` so the name isn't lost: it goes into Supabase
 * auth metadata (which the onboarding profile screen prefills name + username from)
 * and onto the `public.users` row if that's still a generated placeholder.
 *
 * No-op when Apple sent no name (every sign-in after the first), and every step is
 * best-effort — onboarding can always still set the name manually.
 */
export async function persistAppleDisplayName(
  cred: AppleAuthentication.AppleAuthenticationCredential,
): Promise<void> {
  const given = cred.fullName?.givenName?.trim() ?? '';
  const family = cred.fullName?.familyName?.trim() ?? '';
  const fullName = [given, family].filter(Boolean).join(' ').trim();
  if (!fullName) return;

  // 1) Auth metadata — onboarding profile.tsx prefills from user_metadata.full_name.
  try {
    await supabase.auth.updateUser({ data: { full_name: fullName, name: fullName } });
  } catch {
    /* non-fatal */
  }

  // 2) public.users row — set the real name only if it's still a placeholder, so we
  //    never clobber a name the user already chose.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Ensure the row exists (idempotent) before updating it.
    await supabase.rpc('ensure_public_user');

    const { data: row } = await supabase
      .from('users')
      .select('name')
      .eq('user_id', user.id)
      .maybeSingle();

    const current = (row?.name ?? '').trim();
    const emailPrefix = user.email ? user.email.split('@')[0] : '';
    const isPlaceholder = !current || current === 'Synth User' || current === emailPrefix;

    if (isPlaceholder) {
      await supabase
        .from('users')
        .update({ name: fullName, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
    }
  } catch {
    /* non-fatal */
  }
}
