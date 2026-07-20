import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

function notificationPermissionGranted(
  settings: Notifications.NotificationPermissionsStatus,
): boolean {
  const base = settings as Notifications.NotificationPermissionsStatus & {
    granted?: boolean;
    status?: 'granted' | 'denied' | 'undetermined';
  };
  return (
    base.granted === true ||
    base.status === 'granted' ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
  );
}

/**
 * Current OS-level notification permission, normalized. Use this from the UI to
 * decide whether to route a user to Settings (iOS won't re-prompt after a denial).
 */
export async function getNotificationPermissionStatus(): Promise<
  'granted' | 'denied' | 'undetermined'
> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'undetermined';
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (notificationPermissionGranted(settings)) return 'granted';
    const status = (settings as { status?: string }).status;
    return status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'undetermined';
  }
}

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
    console.warn('[push] register skipped: not a physical device');
    return null;
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted = notificationPermissionGranted(existing);
  if (!granted) {
    // On iOS the system prompt only appears while status is "undetermined"; once a
    // user has denied it, requestPermissionsAsync() resolves to denied WITHOUT a
    // prompt. Surface that so we can route the user to Settings from the UI.
    const requested = await Notifications.requestPermissionsAsync();
    granted = notificationPermissionGranted(requested);
  }
  if (!granted) {
    console.warn('[push] register aborted: notification permission not granted (denied/undetermined)');
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;

  if (!projectId) {
    console.warn('[push] register aborted: Expo projectId missing from expoConfig.extra.eas.projectId');
    return null;
  }

  // getExpoPushTokenAsync THROWS if Expo can't mint a token — most commonly when the
  // APNs key/credentials aren't set up on the Expo side for this build profile
  // (e.g. production build with no production APNs key uploaded to expo.dev). That
  // exception previously aborted registration silently, leaving the user with NO
  // token. Guard it, log the real reason, and fail soft.
  try {
    const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!pushToken?.data) {
      console.warn('[push] getExpoPushTokenAsync returned no token data');
      return null;
    }
    return pushToken.data;
  } catch (e) {
    console.error(
      '[push] getExpoPushTokenAsync failed — likely missing APNs credentials on Expo for this build:',
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}
