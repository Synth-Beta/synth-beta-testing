import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

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
