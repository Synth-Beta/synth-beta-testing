import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { supabase } from '../src/integrations/supabase/client';
import { registerForPushNotificationsAsync } from './registerPushNotifications';

/**
 * Registers the Expo push token with Supabase `register_device_token` (same RPC as Vite `PushTokenService`).
 * Call when a session exists (e.g. after sign-in).
 *
 * Delivery: `backend/push-notification-service.js` routes `ExponentPushToken*` tokens through the Expo Push API.
 * The process running `push-notification-worker.js` must have `EXPO_ACCESS_TOKEN` (from expo.dev).
 */
export async function syncExpoPushTokenWithBackend(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return;

  const token = await registerForPushNotificationsAsync();
  if (!token) return;

  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const appVersion = Application.nativeApplicationVersion ?? undefined;

  const { error } = await supabase.rpc('register_device_token', {
    p_device_token: token,
    p_platform: platform,
    p_device_id: null,
    p_app_version: appVersion ?? null,
  });

  if (error) {
    console.warn('[push] register_device_token failed:', error.message);
  }
}
