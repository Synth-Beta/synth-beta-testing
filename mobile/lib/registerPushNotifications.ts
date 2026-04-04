import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let notificationHandlerInstalled = false;

/** Call once after the JS runtime is up (e.g. root layout mount). Avoids module-scope native work during the first tick. */
export function ensureExpoPushNotificationHandler(): void {
  if (notificationHandlerInstalled) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationHandlerInstalled = true;
  } catch (e) {
    console.warn('[push] setNotificationHandler failed', e);
  }
}

/**
 * Requests notification permission and returns an Expo push token (for FCM/APNs via Expo).
 * Send the token to your backend (same flow as Capacitor PushTokenService) for `push-notification-worker`.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  ensureExpoPushNotificationHandler();
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device');
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;

  if (!projectId) {
    console.warn('Expo project ID missing; cannot get Expo push token');
    return null;
  }

  const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
  return pushToken.data;
}
