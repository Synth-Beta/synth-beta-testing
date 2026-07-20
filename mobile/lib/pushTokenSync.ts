import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../src/integrations/supabase/client';
import { registerForPushNotificationsAsync } from './registerPushNotifications';
import Constants from 'expo-constants';

/**
 * Registers the Expo push token with Supabase `register_device_token` (same RPC as Vite `PushTokenService`).
 * Call when a session exists (e.g. after sign-in).
 *
 * Delivery: `backend/push-notification-service.js` routes `ExponentPushToken*` tokens through the Expo Push API.
 * The process running `push-notification-worker.js` must have `EXPO_ACCESS_TOKEN` (from expo.dev).
 */
export async function syncExpoPushTokenWithBackend(): Promise<void> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      console.log('[push] token sync skipped: no active session yet');
      return;
    }

    const token = await registerForPushNotificationsAsync();
    if (!token) {
      // registerForPushNotificationsAsync already logged the specific reason
      // (no device / permission denied / no projectId / Expo token error).
      console.warn('[push] token sync: no Expo push token obtained — user will not receive push');
      return;
    }

    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const appVersion = Application.nativeApplicationVersion ?? undefined;

    const { error } = await supabase.rpc('register_device_token', {
      p_device_token: token,
      p_platform: platform,
      p_device_id: null,
      p_app_version: appVersion ?? null,
    });

    if (error) {
      console.warn('[push] register_device_token RPC failed:', error.message);
      return;
    }

    console.log('[push] device token registered', {
      platform,
      tokenTail: token.slice(-12),
    });
  } catch (e) {
    // Never let push registration crash app startup.
    console.error('[push] token sync threw:', e instanceof Error ? e.message : e);
  }
}

export async function unregisterExpoPushToken(): Promise<void> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;
    const { data: tokenData } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!tokenData) return;
    await supabase.rpc('unregister_device_token', { p_device_token: tokenData });
  } catch {
    // Best-effort — don't block logout on push cleanup failure
  }
}
